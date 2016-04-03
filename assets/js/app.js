$(function() {
  var device_list_refresh_interval=60; // seconds
  var device_info_refresh_interval=10; // seconds
  var access_token = "";
  var claim_code = "";
  var claimed_devices = "";
  var current_device = "";
  var device_vars = {};
  var device_vartypes = {};

  var access_token = localStorage.getItem("access_token");
  var particle = new Particle();

  $('[data-toggle="tooltip"]').tooltip();

  $("#login_button").click(function(e){
    e.preventDefault();
    do_login();
  });

  $("#login input").keypress(function(event) {
    if (event.which == 13) {
        do_login();
    }
  });

  do_login();

  function do_login(){
    login()
      .then(get_devices)
      .then(update_devices)
      .then(get_devinfo)
      .then(update_devinfo)
      .then(get_variables)
      .then(subscribe_events)
      .then(display_event)
      .catch(function(err){ console.warn('Error: ', err); });
  }

  function login(){
    if(!access_token){
      var email = $('#login_email').val();
      var pass = $('#login_password').val();

      if(email && pass){
        return particle.login({
          username: email,
          password: pass
        }).then(login_success, login_err);
      } else{
        return show_login('Missing credentials');
      }
    } else {
      return particle.listDevices({ auth: access_token }).then(login_success, login_err);
    }
  }

  function show_login(rejectMsg){
    return new Promise(function(resolve, reject){
      $('#terminal').fadeOut(150, function(){
        $('#login').fadeIn(150, set_heights);
        if( rejectMsg) reject(rejectMsg);
      });
    });
  }

  function show_terminal(){
     return new Promise(function(resolve, reject){
      $('#login').fadeOut(150, function(){
        $('#terminal').fadeIn(150, set_heights);
        resolve();
      });
    });
  }

  function login_success(data){
    $('#login_button').attr('disabled',false);
    $('#login_error').hide();
    $('#login_email').val("");
    $('#login_password').val("");

    if(data.body.access_token){
      access_token = data.body.access_token;
      localStorage.setItem("access_token", access_token);
    }

    show_terminal();
    get_devices();
  }

  function login_err(err){
    $('#login_button').attr('disabled',false);
    $('#login_password').val("");
    $('#login_error').html(err.errorDescription);
    $('#login_error').show();
    show_login();
  }

  function get_devices(){
    return particle.listDevices({auth: access_token})
  }

  function update_devices(devices){
    console.log('Devices: ', devices);
    $("#deviceIDs").html('');
    _.each(devices.body, function(item, idx) {
      $("#deviceIDs").append('<option id="'+item.id+'">'+item.id+'</option>');
    });
    current_device=$("#deviceIDs").val()
  }

  function get_devinfo(){
    return particle.getDevice({deviceId: current_device,auth: access_token})
  }

  function update_devinfo(data){
    if(data.body.connected){
      $("#devstatus").html('online');
    }
    else{
      $("#devstatus").html('offline');
    }

    if (_.isEmpty(device_vars) && !_.isEmpty(data.body.variables)){
      $("#varstbody").html('');
    }
    else if(!_.isEmpty(device_vars) && _.isEmpty(data.body.variables)){
      $("#varstbody").html('<td colspan="3" class="centered"><i>None exposed by firmware</i></td>');
    }
    _.each(device_vars, function(value, key) {
      if(!data.body.variables.hasOwnProperty(key)){
          delete device_vars[key];
      }
    });
    _.each(data.body.variables, function(value, key) {
      if(!device_vars.hasOwnProperty(key)){
        device_vars[key]="";
        device_vartypes[key]=value;
        $("#varstbody").append('<tr><td>'+key+'</td>'+
                               '<td>'+value+'</td>'+
                               '<td id="'+key+'">?</td></tr>');
      }
    });

    $("#funcs").html('');
    _.each(data.body.functions, function(item, idx) {
      $("#funcs").append('<option id="'+item+'">'+item+'</option>');
    });
  }

  function get_variables(){
    console.log('get_variables()');
    _.each(device_vars, function(value, key) {
      particle.getVariable({deviceId: current_device, name: key, auth: access_token})
        .then(update_variable)
    });
  }

  function update_variable(data){
    if(device_vars[data.body.name] != data.body.result){
      device_vars[data.body.name]=data.body.result;
      if(device_vartypes[data.body.name] == 'double'){
        $("[id='"+data.body.name+"']").html(data.body.result.toPrecision(6).toString());
      }
      else if(device_vartypes[data.body.name] == 'string'){
        var str=data.body.result;
        if(str.length>15){
            str=str.substring(0,13)+'..';
        }
        $("[id='"+data.body.name+"']").html(str);
      }
      else{
        $("[id='"+data.body.name+"']").html(data.body.result);
      }
    }
  }

  function subscribe_events(){
    return particle.getEventStream({deviceId: current_device,auth: access_token});
  }

  function display_event(stream){
    stream.on('event', function(event) {
      //console.log("Event: " + event);
      var event_class="";
      switch(event.name){
        case 'oak/devices/stderr': // Typo in OakSystem.ino
        case 'oak/device/stderr':
          if($("#content").html().endsWith('<br>')){
            prestr='<br>';
          }
          else{
            prestr='';
          }
          poststr='<br>';
          event_class='text_stderr';
          break;
        case 'oak/device/stdout':
          prestr='';
          poststr='';
          event_class='text_stdout';
          break;
        default:
          event_class='text_event';
          if($("#content").html().endsWith('<br>')){
            prestr='<br>';
          }
          else{
            prestr='';
          }
          prestr=prestr+'Event: '+ event.name + ' - ';
          poststr='<br>';
          if(event.data == null){
            event.data='<no data>';
          }
      }
      htmlstr=(event.data + '').replace(/([^>\r\n]?)(\r\n|\n\r|\r|\n)/g, '$1<br>$2');
      htmlstr='<div class="'+event_class+'">'+prestr+htmlstr+poststr+'</div>';
      $("#content").append(htmlstr);
      $("html, body").animate({ scrollTop: $(document).height() }, 1000);
    });
  }

  $("#reboot").click(function(){
    send_cmd("reboot");
  });

  $("#configmode").click(function(){
    send_cmd("config mode");
  });

  $("#usermode").click(function(){
    send_cmd("user mode");
  });

  function send_cmd(cmd){
    console.log("Sending Command: " + cmd);
    particle.publishEvent({name:'oak/device/reset',data: cmd,isPrivate: true,auth: access_token});
  }

  $("#send").click(function(){
    send_data($("#senddata").val());
  });

  function send_data(data){
    console.log("Sending Data: " + data);
    particle.publishEvent({name:'oak/device/stdin',data: data,isPrivate: true,auth: access_token});
  }

  $("#logout").click(function(){
    localStorage.removeItem("access_token");
    location.reload();
  });

  $("#refresh").click(function(){
    get_devices()
      .then(update_devices);
    get_devinfo()
      .then(update_devinfo);
  });

  $("#deviceIDs").on('change',function(){
    current_device=this.value
    get_devinfo()
      .then(update_devinfo);
  });

  setInterval(function(){
    console.log('Update device list timer');
    get_devices()
      .then(update_devices);
    },device_list_refresh_interval*1000);

  setInterval(function(){
    console.log('Update device info timer');
    get_devinfo()
      .then(update_devinfo);
    get_variables();
    },device_info_refresh_interval*1000);
});

function set_heights(){
  var headerHeight = $("#header").outerHeight(true);
  var footerHeight = $("#footer").outerHeight(true);
  $("#content").css('padding-top', headerHeight+10);
  $("#content").css('padding-bottom', footerHeight+10);
}

$(window).resize(set_heights);
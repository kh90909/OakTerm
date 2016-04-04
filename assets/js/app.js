$(function() {
  var device_list_refresh_interval=60; // seconds
  var device_info_refresh_interval=10; // seconds
  var access_token = "";
  var claim_code = "";
  var claimed_devices = "";
  var current_device = "";
  var device_vars = {};
  var device_vartypes = {};
  var device_varclasses = {'int32': 'var_int32', 'double': 'var_double', 'string': 'var_string'};
  var settings = get_settings();

  var access_token = localStorage.getItem("access_token");
  var particle = new Particle();

  restore_settings();
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

  do_login(true);

  function do_login(firstRun){
    login(firstRun)
      .then(get_devices)
      .then(update_devices)
      .then(get_devinfo)
      .then(update_devinfo)
      .then(get_variables)
      .then(subscribe_events)
      .then(display_event)
      .catch(function(err){ console.warn('Error: ', err); });
  }

  function login(firstRun){
    $('#login_error').hide();

    if(!access_token){
      var email = $('#login_email').val();
      var pass = $('#login_password').val();

      if(!firstRun){
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

    if(data.body.access_token){
      access_token = data.body.access_token;
      localStorage.setItem("access_token", access_token);
    }

    show_terminal();
    get_devices();
  }

  function login_err(err){
    $('#login_button').attr('disabled',false);
    $('#login_error').html(err.errorDescription.split(' - ')[1]);
    $('#login_error').show();

    if(err.body.error == 'invalid_token'){
      localStorage.removeItem("access_token");
    }

    show_login();
  }

  function get_devices(){
    return particle.listDevices({auth: access_token})
  }

  function update_devices(devices){
    console.log('Devices: ', devices);
    $("#deviceIDs").html('');
    _.each(devices.body, function(item, idx) {
      var name = "";
      if(item.name) name += item.name+' ';
      name += '('+item.id.slice(-6)+')';
      $("#deviceIDs").append('<option value="'+item.id+'">'+name+'</option>');
    });
    current_device=$("#deviceIDs").val()
  }

  function get_devinfo(){
    return particle.getDevice({deviceId: current_device,auth: access_token})
  }

  function update_devinfo(data){
    if(data.body.connected){
      $("#devstatus").removeClass('label-danger').addClass('label-success').html('online');
    } else{
      $("#devstatus").removeClass('label-success').addClass('label-danger').html('offline');
    }

    if (_.isEmpty(device_vars) && !_.isEmpty(data.body.variables)){
      $("#varstbody").html('');
    }
    else if(!_.isEmpty(device_vars) && _.isEmpty(data.body.variables)){
      $("#varstbody").html('<td colspan="2" class="centered"><i>None exposed by firmware</i></td>');
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
        var varclass=device_varclasses[device_vartypes[key]];
        $("#varstbody").append('<tr class='+varclass+' id='+key+'><td>'+key+'</td>'+
                               '<td id="'+key+'">?</td></tr>');
        $("tr[id='"+key+"']").click(dump_variable);
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
    console.log('update_variable(): ',data.body.name,'('+device_vartypes[data.body.name]+') old val:',device_vars[data.body.name],' new val:',data.body.result)
    if(device_vars[data.body.name] != data.body.result){
      device_vars[data.body.name]=data.body.result;
      if(device_vartypes[data.body.name] == 'double'){
        if(data.body.result == null){
          $("[id='"+data.body.name+"']").html('NaN/Inf');
        }
        else{
          $("td[id='"+data.body.name+"']").html(data.body.result.toPrecision(6).toString());
        }
      }
      else if(device_vartypes[data.body.name] == 'string'){
        var str=data.body.result;
        if(str.length>15){
            str=str.substring(0,13)+'..';
        }
        $("td[id='"+data.body.name+"']").html(str);
      }
      else{
        $("td[id='"+data.body.name+"']").html(data.body.result);
      }
    }
  }

  function dump_variable(event){
    console.log('dump_variable(): click event:',event);
    var id=this.id;
    var vartype=device_vartypes[this.id];
    var varclass=device_varclasses[vartype];
    var htmlstr='<div class="text_variable">Variable '+id+': ' +
                device_vars[this.id] +
                ' <span class="'+varclass+'">('+vartype+')</span></div>';
    $("#content").append(htmlstr);
    $("html, body").animate({ scrollTop: $(document).height() }, 1000);
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
    current_device=this.value;
    console.log( this.value, this);
    get_devinfo()
      .then(update_devinfo);
  });

  $('#sidebar').hover(function(){
    $('body').css('overflow', 'hidden');
  }, function(){
    $('body').css('overflow', 'auto')
  });

  $('#show-sidebar').on('click touch', function(e){
    e.preventDefault();
    $('.fixed-sidebar').toggleClass('open');
  });

  $('#file-btn').click(function(){
    $('#file-input').click();
  })

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

  $('#save-settings').on('click', save_settings);
  $('#settings input, #settings select').on('change', save_settings);

  function save_settings(){
    var newSettings = $('#settings').serializeArray();
    localStorage.setItem("settings", JSON.stringify(newSettings));
    console.log( 'Saved settings:', newSettings);
  }

  function get_settings(){
    var new_settings;
    var saved_settings = localStorage.getItem("settings");
    var defaults = [
      {"name":"autoscroll","value":"onEvent"},
      {"name":"lineends","value":"rn"},
      {"name":"subenter","value":"true"}
    ];

    if(saved_settings){
      try{
        JSON.parse(saved_settings);
        new_settings = _.extend(defaults, JSON.parse(saved_settings) );
      } catch(e){
        console.warn('Error: invalid localStorage settings JSON');
        new_settings = defaults;
      }
    } else{
      new_settings = defaults;
      save_settings();
    }

    return new_settings;
  }

  function restore_settings(){
    _.each(settings, function(item){
      var $item = $('[name="'+item.name+'"]');

      if($item.attr('type') == 'radio'){
        $item.each(function(){
          if( $(this).val() == item.value){
            $(this).prop('checked', 'checked');
          }
        });
      } else{
        $item.val(item.value);
      }
    });
  }
});

function set_heights(){
  var headerHeight = $("#header").outerHeight(true);
  var footerHeight = $("#footer").outerHeight(true);
  $("#content").css('padding-top', headerHeight+10);
  $("#content").css('padding-bottom', footerHeight+10);

  if($(window).width() < 768){
    $('.fixed-sidebar').css('padding-top', headerHeight+10)
    $('.fixed-sidebar').css('padding-bottom', footerHeight+10)
  }
}

$(window).resize(set_heights);
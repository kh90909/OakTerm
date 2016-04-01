$(function() {
  var device_list_refresh_interval=60; // seconds
  var device_info_refresh_interval=10; // seconds
  var access_token = "";
  var claim_code = "";
  var claimed_devices = "";
  var current_device = "";

  //$('#settings').button({ icons: {primary:'ui-icon-gear'} });

  var access_token = localStorage.getItem("access_token");
  var particle = new Particle();

  $("#login_button").click(function(){
    do_login();
  });

  if(access_token != null){
    do_login();
  }

  function do_login(){
    login()
      .then(get_devices)
      .then(update_devices)
      .then(get_devinfo)
      .then(update_devinfo)
      .then(subscribe_events)
      .then(display_event);
      //.catch(error_handler)
  }

  function login(){
    if(access_token == null){
      return particle.login({username: $('#login_email').val(),
              password: $('#login_password').val()})
        .then(login_success);
    }
    else{
      return new Promise(function(resolve,reject){resolve(null)});
    }
  }

  function login_success(data){
    $('#login_button').attr('disabled',false);
    $('#login_error').hide();
    $('#login_email').val("");
    $('#login_password').val("");
    access_token = data.body.access_token;
    console.log('login_success(): access_token='+access_token);
    localStorage.setItem("access_token", access_token);
    get_devices();
  }

  function login_err(err){
    $('#login_button').attr('disabled',false);
    $('#login_password').val("");
    $('#login_error').html(err.errorDescription);
    $('#login_error').show();
  }

  function get_devices(){
    return particle.listDevices({auth: access_token})
  }

  function update_devices(devices){
    console.log('Devices: ', devices);
    $("#deviceIDs").html('');
    $.each(devices.body, function(idx,item) {
      $("#deviceIDs").append('<option id="'+item.id+'">'+item.id+'</option>');
    });
    current_device=$("#deviceIDs").val()
    $('#login').fadeOut(150,function(){$('#terminal').fadeIn(150,set_heights);});
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
    console.log('update_devinfo(): connected='+data.body.connected);
    console.log('update_devinfo(): variables='+data.body.variables);
    console.log('update_devinfo(): functions='+data.body.functions);
    $("#vars").html('');
    $.each(data.body.variables, function(idx,item) {
      $("#vars").append('<option id="'+item.name+'">'+item.name+'</option>');
    });
    $("#funcs").html('');
    $.each(data.body.functions, function(idx,item) {
      $("#funcs").append('<option id="'+item+'">'+item+'</option>');
    });
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
      $("#content").animate({ scrollTop: $("#content").prop("scrollHeight") - $("#content").height() }, 1);
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
    },device_info_refresh_interval*1000);
});

function set_heights(){
  var header_height = $("#header").outerHeight(true);
  var footer_height = $("#footer").outerHeight(true);
  console.log('body height: '+$("body").outerHeight(true));
  var content_outer = $("#content").outerHeight(true)-$("#content").height()
  var content_height = $("body").height() - header_height - footer_height - content_outer;
  $("#content").height(content_height);
  console.log('Header height: '+header_height);
  console.log('Footer height: '+footer_height);
  console.log('Content height: '+content_height);
  console.log('Content top: '+$("#content").position().top);
}

$(window).resize(set_heights);

// Wait for window load
$(window).load(function() {
  // Animate loader off screen
  $(".load").fadeOut(1000,function(){$("#wrapper").fadeIn(500);});
});
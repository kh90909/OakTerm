$(function() {
  var device_list_refresh_interval=10; // seconds
  var device_info_refresh_interval=10; // seconds
  var claim_code = "";
  var claimed_devices = "";
  var current_device = "";
  var pollers = [];
  var device_vars = {};
  var settings = get_settings();
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

  do_login(true);

  function do_login(firstRun){
    login(firstRun)
      .then(restore_settings)
      .then(start_pollers)
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
        else resolve();
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

      var $opt = $('<option>', {value: item.id, selected: (current_device == item.id), html: name });
      $("#deviceIDs").append($opt);
    });

    current_device=$("#deviceIDs").val()
  }

  function get_devinfo(){
    return particle.getDevice({deviceId: current_device, auth: access_token});
  }

  function update_devinfo(data){
    $("#devstatus").attr('data-status', data.body.connected);

    if(_.isEmpty(data.body.variables)){
      $("#varstbody").html('<td colspan="2" class="centered"><i>None exposed by firmware</i></td>');
    } else{
      var new_vars = _.mapObject(data.body.variables, function(item, key){
        return { type: item }
      });

      // remove missing device_vars, merge in from new_vars
      _.each(device_vars, function(variable, name){
        if( !new_vars[name]) delete device_vars[name];
        $('#name').parents('tr').remove();
      });

      device_vars = $.extend(true, device_vars, new_vars)

      $("#varstbody").html('');
      _.each(device_vars, function(variable, name) {
          var $row = $('<tr>');
          var $var = $('<td>', {"data-variable": name, html: (typeof variable.value == 'undefined') ? '?' : variable.value.toString() });
          var $btn = $('<button>', {type: 'button', "class":"btn btn-sm", html: name, "data-variable": name})
            .addClass('btn-var-'+name)
            .addClass('var-type-'+variable.type);

          $row
            .append( $('<td>').append($btn) )
            .append($var);

          $("#varstbody").append($row);

          $('.btn-var-'+name).tooltip({
            placement: 'right',
            title: variable.type
          });
      });
    }

    if(_.isEmpty(data.body.functions)){
      $("#funcs").html('<option>--</option>');
    } else{
      _.each(data.body.functions, function(item, idx) {
        $("#funcs").append('<option>', {value: item, html: item});
      });
    }
  }

  function get_variables(){
    _.each(device_vars, function(variable, name) {
      particle.getVariable({deviceId: current_device, name: name, auth: access_token})
        .then(update_variable)
    });
  }

  function update_variable(data){
    device_vars[data.body.name].value = data.body.result;
    var localVar = device_vars[data.body.name];
    var result = "";

    if((localVar.type == 'double') && (data.body.result == null)){
      result = 'NaN/Inf';
    } else{
      result = data.body.result.toString();
    }

    $("[id='"+data.body.name+"']").html(result);
  }

  function dump_variable(event){
    console.log('dump_variable(): click event:',event);
    var id=event.target.dataset.variable;
    var device_var = device_vars[id]
    var htmlstr='<div class="text_variable">Variable '+id+': ' +
                device_var.value +
                ' <span class="var-type-'+device_var.type+'">('+device_var.type+')</span></div>';
    terminal_print(htmlstr);
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
      terminal_print(htmlstr);
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

  $("#send").click(function(){
    send_data($("#senddata").val());
  });

  $("#logout").click(function(){
    localStorage.removeItem("access_token");
    localStorage.removeItem("current_device");
    location.reload();
  });

  $("#refresh").click(function(){
    get_devices()
      .then(update_devices);
    get_devinfo()
      .then(update_devinfo);
  });

  $(document).on('click', '#varstable [data-variable]', dump_variable);

  $("#deviceIDs").on('change',function(){
    current_device=this.value;
    get_devinfo()
      .then(update_devinfo)
      .then(subscribe_events)
      .then(display_event);
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
  });

  $('#settings input, #settings select').on('change', save_settings);

  function terminal_print(content){
    $("#content").append(content);
    $("html, body").animate({ scrollTop: $(document).height() }, 1000);
  }

  function send_cmd(cmd){
    console.log("Sending Command: " + cmd);
    particle.publishEvent({name:'oak/device/reset',data: cmd,isPrivate: true,auth: access_token});
  }

  function send_data(data){
    console.log("Sending Data: " + data);
    particle.publishEvent({name:'oak/device/stdin',data: data,isPrivate: true,auth: access_token});
  }

  function start_pollers(){
    return new Promise(function(resolve, reject){
      if( pollers.update_devices) clearTimeout( pollers.update_devices);
      pollers['update_devices'] = setInterval(function(){
        console.log('Update device list timer');
        get_devices()
          .then(update_devices);
        },device_list_refresh_interval*1000);

      if( pollers.update_devinfo) clearTimeout( pollers.update_devinfo);
      pollers['update_devinfo'] = setInterval(function(){
        console.log('Update device info timer');
        get_devinfo()
          .then(update_devinfo)
          .then(get_variables);
        },device_info_refresh_interval*1000);

      resolve();
    });
  }

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
    // App settings
    current_device = localStorage.getItem("current_device");

    // User settings modal
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
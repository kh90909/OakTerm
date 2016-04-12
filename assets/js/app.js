$(function() {
  var device_list_refresh_interval=10; // seconds
  var device_info_refresh_interval=10; // seconds
  var claim_code = "";
  var claimed_devices = "";
  var all_devices;
  var current_device = {};
  var pollers = [];
  var device_vars = {};
  var device_functions = [];
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
      .then(show_terminal)
      .then(get_devices)
      .then(update_devices)
      .then(get_devinfo)
      .then(update_devinfo)
      .then(start_pollers)
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
    all_devices = devices.body;
    $("#deviceIDs").html('');

    _.each(devices.body, function(item, idx) {
      var name = "";
      if(item.name) name += item.name+' ';
      name += '('+item.id.slice(-6)+')';

      var curId = current_device ? current_device.id : false;
      var $opt = $('<option>', {value: item.id, selected: (curId == item.id), html: name });
      $("#deviceIDs").append($opt);
    });

    current_device = _.findWhere(all_devices, {id: $("#deviceIDs").val()} );
    if( current_device){
      localStorage.setItem("current_device", JSON.stringify(current_device));
    }
  }

  function get_devinfo(){
    return particle.getDevice({deviceId: current_device.id, auth: access_token});
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

    $('#devtable tbody').html('');
    _.each(_.pick(data.body, 'id', 'last_heard', 'last_ip_address'), function(val, idx){
      $('#devtable tbody').append('<tr><td>'+idx+'</td><td><input class="form-control compact" value="'+val+'" /></td></tr>');
    });

    device_functions = _.filter(device_functions,function(item) {
      if( $.inArray(item,data.body.functions)>-1) {
        return true;
      } else {
        $(document).off('click','[id="btn-'+item+'"]');
        $(document).off('keypress','[id="arg-'+item+'"]');
        $('[id="row-'+item+'"]').remove();
        return false;
      }
    });

    if(_.isEmpty(data.body.functions)){
      $('#row-nofuncs').show();
    } else{
      $('#row-nofuncs').hide();
      _.each(data.body.functions, function(item, idx) {
        if( $.inArray(item,device_functions)<0) {
          var $row=$('<tr>',{"id": 'row-'+item});
          $row.html($('#func-template').html().replace(/{{param1}}/g,item));
          $('#funcstbody').append($row);

          $(document).on('shown.bs.collapse', '[id="func-'+item+'"]', function() {
            $('body').find('[id="arg-'+item+'"]').focus();
          });
          $(document).on('click','[id="btn-'+item+'"]',call_function);
          $(document).on('keypress','[id="arg-'+item+'"]',function(event) {
            if(event.which == 13) {
              $('body').find('[id="btn-'+item+'"]').trigger("click");
            }
          });
        }
      });
      device_functions = $.extend(true,device_functions,data.body.functions);
    }
  }

  function call_function(event){
    var name=this.id.slice(4);
    var arg=$('[id="arg-'+name+'"]').val();
    particle.callFunction({deviceId: current_device.id,
                           name: name,
                           argument: arg,
                           auth: access_token})
      .then(function(data){ dump_function(name,arg,data.body.return_value); });
    $('[id="func-'+name+'"]').collapse('hide');
  }

  function dump_function(func,arg,result){
    var htmlstr='<div class="text_function">Function call ' +
                func + '("' + arg + '") returned ' + result + '</div>';
    terminal_print(htmlstr);
  }

  function get_variables(){
    _.each(device_vars, function(variable, name) {
      particle.getVariable({deviceId: current_device.id, name: name, auth: access_token})
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
    var id=event.target.dataset.variable;
    var device_var = device_vars[id]
    var htmlstr='<div class="text_variable">Variable '+id+': ' +
                device_var.value +
                ' <span class="var-type-'+device_var.type+'">('+device_var.type+')</span></div>';
    terminal_print(htmlstr);
  }

  function subscribe_events(){
    return particle.getEventStream({deviceId: current_device.id,auth: access_token});
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

  $("#reboot-all").click(function(e){
    e.preventDefault();
    send_cmd("reboot");
  });

  $("#reboot-current").click(function(e){
    e.preventDefault();
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
    current_device= _.findWhere(all_devices, {id: this.value});
    localStorage.setItem("current_device", JSON.stringify(current_device));

    $('#devtable tbody').html('');
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

  $('#content').on('click touch', function(){
    if( $('#sidebar').hasClass('open'))
      $('.fixed-sidebar').toggleClass('open');
  });

  $('#file-btn').click(function(){
    $('#file-input').click();
  });

  $('#settings input, #settings select').on('change', save_settings);

  $('#device-details,#var-details,#func-details').on('hide.bs.collapse', toggle_arrow);
  $('#device-details,#var-details,#func-details').on('show.bs.collapse', toggle_arrow);

  $('#modal-rename-device').on('show.bs.modal', function (e) {
    $('#modal-rename-device [data-bind="deviceName"]').text(current_device.name);
  });

  function toggle_arrow(e){
    $('[data-target="#'+e.target.id+'"] i').toggleClass('fa-angle-up fa-angle-down');
  }

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
    try{
      current_device = JSON.parse(localStorage.getItem("current_device"));
    } catch(e){
      current_device = null;
    }

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
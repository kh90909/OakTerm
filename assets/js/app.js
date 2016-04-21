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
  var activeStream;

  $('[data-toggle="tooltip"]').tooltip();

  do_login(true);

  function do_login(firstRun){
    login(firstRun)
      .then(restore_settings)
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

    return show_terminal();
  }

  function login_err(err){
    $('#login_button').attr('disabled',false);
    var errMsg = err.errorDescription
      ? err.errorDescription.split(' - ')[1]
      : "Login failed - please try again.";

    $('#login_error').html(errMsg);
    $('#login_error').show();

    if(err.body.error == 'invalid_token'){
      localStorage.removeItem("access_token");
    }

    return show_login();
  }

  function get_devices(){
    return particle.listDevices({auth: access_token})
  }

  function update_devices(devices){
    //console.log('Devices: ', devices);
    all_devices = devices.body;

    $("#deviceIDs").html('');

    _.each(all_devices, function(item, idx) {
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
      device_vars = {};
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

  function rejected_promise(data){
    return new Promise(function(resolve, reject){
      reject(data);
    });
  }

  function gen_err_handler(msg){
    return function(data){
      console.log(msg + ':', data.body.error);
      return rejected_promise(data);
    }
  }

  function get_variable(name){
    return particle.getVariable({deviceId: current_device.id, name: name,
                                 auth: access_token})
      .catch(gen_err_handler('Error getting variable value'))
      .then(update_variable);
  }

  function get_and_dump_variable(event){
    get_variable(event.target.dataset.variable)
      .then(dump_variable);
  }

  function get_variables(){
    _.each(device_vars, function(variable, name) {
      get_variable(name);
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

    $("td[data-variable='"+data.body.name+"']").html(result);

    return data;
  }

  function dump_variable(data){
    var device_var = device_vars[data.body.name];
    var htmlstr='<div class="text_variable">Variable ' +
                data.body.name +': ' + device_var.value +
                ' <span class="var-type-' + device_var.type + '">(' +
                device_var.type+')</span></div>';

    terminal_print(htmlstr);
  }

  function subscribe_events(){
    return particle.getEventStream({deviceId: current_device.id,auth: access_token});
  }

  function format_time_span(optdate) {
    var date;
    if(optdate){
      date = new Date(optdate);
    } else {
      date = new Date();
    }
    return '<span class="timestamp">[' +
             date.toTimeString().substring(0,8) +
           '] </span>';
  }

  function display_event(stream){
    activeStream = stream;
    activeStream.active = true;

    activeStream.on('event', function(event) {

      var event_class="";
      var prestr="";
      switch(event.name){
        case 'oak/devices/stderr': // Typo in OakSystem.ino
        case 'oak/device/stderr':
          event_class='text_stderr';
          break;
        case 'oak/device/stdout':
          event_class='text_stdout';
          break;
        default:
          event_class='text_event';
          prestr='Event: '+ event.name + ' - ';
          if(event.data == null){
            event.data='<no data>';
          }
      }
      htmlstr=(event.data + '').replace(/([^>\r\n]?)(\r\n|\n\r|\r|\n)/g, '$1<br>$2');
      htmlstr='<div class="'+event_class+'">'+prestr+htmlstr+'</div>';
      terminal_print(htmlstr, event.published_at);
    });
  }

  $("#login_button").click(function(e){
    e.preventDefault();
    do_login();
  });

  $("#login input").keypress(function(event) {
    if (event.which == 13) {
        do_login();
    }
  });

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

  $("#modal-send-event-button").click(function(){
    var event={ name: $('#event-name').val(),
                data: $('#event-data').val(),
                isPrivate: $('#event-private').prop('checked'),
                auth: access_token };

    console.log('Sending event:', event);
    particle.publishEvent(event)
      .then(function(response) { return {event:event, response:response}; })
      .catch(function(response) { return new Promise(function(resolve, reject){
        reject({event:event, response:response});
        });
      })
      .then(dump_sent_event)
      .catch(dump_send_event_err);
  });

  $('.file-input-hidden > button').on('click', function(){
    $(this).parent().find('[type="file"]').click();
  });

  function dump_sent_event(data) {
    delete data.event['auth'];
    var htmlstr='<div class="text_sentevent">Sent event: ' +
                JSON.stringify(data.event) + '</div>';
    terminal_print(htmlstr);
  }

  function dump_send_event_err(data) {
    delete data.event['auth'];
    var eventTime = format_time_span();
    var errMsg = data.response.errorDescription
      ? data.response.errorDescription.split(' - ')[1]
      : "No error description provided.";

    var htmlstr='<div class="text_sentevent">' + eventTime + 'Error sending event: ' +
                JSON.stringify(data.event) + '. ' +
                errMsg + '</div>';
    terminal_print(htmlstr);
  }

  $(document).on('click', '#varstable [data-variable]', get_and_dump_variable);

  $("#deviceIDs").on('change',function(){
    current_device= _.findWhere(all_devices, {id: this.value});
    localStorage.setItem("current_device", JSON.stringify(current_device));

    if( activeStream && activeStream.active ){
      stop_stream();
    }

    var htmlStr = '<div class="text_devadm">Device change: '+current_device.name+'</div>';
    terminal_print(htmlStr);

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

  $('#file-input').on('change',send_file);

  $('#send-data-form').on('submit', function(e){
    e.preventDefault();
    var data=$("#senddata").val()
    var htmlstr='<div class="text_stdin">'+ data + '</div>';
    send_data(data);
    terminal_print(htmlstr);
  });

  $('#send-data-form [data-submit]').on('click', function(){
    $(this).parents('form').submit();
  });

  $('#send-data-form input').on('keypress', function(e){
    if( (e.which == 13) && !get_setting('subenter')) e.preventDefault();
  });

  function send_file(e){
    console.log('send_file(e): e:',e);
    if(e.target.files && e.target.files[0]){
      var file = e.target.files[0];
      var offset = 0;
      var slice_len = 255;

      // Disable user "Send Data" button so that it's not possible to send
      // in the middle of the file upload
      $("#send-data-form [type='submit']").addClass('disabled');
      slice_reader();

      function slice_reader(){
        var reader = new FileReader();
        var slice = file.slice(offset,offset+slice_len);

        reader.onload = read_handler;
        reader.onerror = error_handler;
        reader.readAsBinaryString(slice);
      };

      function read_handler(e){
        send_data(e.target.result);
        offset+=slice_len;
        if(offset >= file.size){
          reset_ui();
          return;
        }
        setTimeout(slice_reader,1000);
      }

      function error_handler(e){
          console.log('Error reading file: ' + e.target.error);
          reset_ui();
      }

      function reset_ui(){
          $('#file-input').val(null);
          $("#send-data-form [type='submit']").removeClass('disabled');
      }
    }
  }

  $('#settings input, #settings select').on('change', save_settings);
  $('#settings [data-toggle="buttons"] .btn').on('click', function(){
    // Needed to force Bootstrap to bind the actual radios to these btns
    $(this).find('[type="radio"]').prop('checked', 'true');
    save_settings();
  });

  $('#settings label[for^="scrollbars"]').on('change', function(){
    if( $(this).find('input').val() == 'true'){
      $('html').removeClass('no-scroll-bars');
    } else{
      $('html').addClass('no-scroll-bars');
    }
  });

  // Bootstrap 4 alpha has a bug where events on radio buttons in a btn-group
  // don't fire (https://github.com/twbs/bootstrap/issues/17599), so listen for
  // the event on the labels as a workaround.
  $('#settings label[for^="show-"]').on('change', show_hide_content);

  function show_hide_content(e){
    var id_parts = e.target.htmlFor.split('-');
    $('#content').toggleClass('hide_' + id_parts[1], id_parts[2] == 'off');
    //console.log('show_hide_content(): Turning', id_parts[1], id_parts[2]);
  }

  $('#device-details,#var-details,#func-details').on('hide.bs.collapse', toggle_arrow);
  $('#device-details,#var-details,#func-details').on('show.bs.collapse', toggle_arrow);

  $('#modal-rename-device').on('show.bs.modal', function (e) {
    $('#modal-rename-device [data-bind="deviceName"]').text(current_device.name);
  });

  $('#rename-device').on('submit', function(e){
    e.preventDefault();
    var $modal = $(this).parents('.modal');
    var newName = $modal.find('input').val();

    if( newName == ""){
      $modal.find('.form-group').addClass('has-danger');
      $modal.find('input').addClass('form-control-danger');
      return;
    } else{
      $modal.find('.form-group').removeClass('has-danger');
      $modal.find('input').removeClass('form-control-danger');
      rename_device(newName).then(function(){
        $modal.modal('hide');
      });
    }
  });

  function stop_stream(stream){
    if(!stream) stream = activeStream;
    stream.abort();
    $('[data-stream-active]').attr('data-stream-active', false);
    activeStream = null;
    return activeStream;
  }

  function toggle_arrow(e){
    $('[data-target="#'+e.target.id+'"] i').toggleClass('fa-angle-up fa-angle-down');
  }

  function terminal_print(content, specific_time){
    var eventTime = format_time_span(specific_time);
    var $content = $(content).prepend(eventTime);
    content = $content[0];

    $("#content").append(content);

    switch(get_setting('autoscroll')){
      case 'pageBtm':
        if((window.innerHeight + window.scrollY) >= (document.body.offsetHeight-30)) {
          $("html, body").animate({ scrollTop: $(document).height() }, 250);
        }
        break;
      case 'onEvent':
        $("html, body").animate({ scrollTop: $(document).height() }, 250);
        break;
    }
  }

  function send_cmd(cmd){
    console.log("Sending Command: " + cmd);
    particle.publishEvent({name: 'oak/device/reset/' + current_device.id, data: cmd, isPrivate: true, auth: access_token});
  }

  function send_data(data){
    var lineEnd = get_setting('lineends');
    if(lineEnd) data += lineEnd;
    console.log("Sending Data: " + data);
    particle.publishEvent({name: 'oak/device/stdin/' + current_device.id, data: data, isPrivate: true, auth: access_token});
  }

  function rename_device(newName){
    var oldName = current_device.name;
    return particle.renameDevice({deviceId: current_device.id, name: newName, auth: access_token })
      .then(function(device){
        // The rest of the chain expects an array of devices
        newName = device.body.name;
        device.body = [device.body];
        return device;
      })
      .then(update_devices)
      .then(function(device){
        var htmlstr='<div class="text_devadm">Device Rename: '+oldName+' to '+newName+'</div>';
        terminal_print(htmlstr);
      })
  }

  function start_pollers(){
    return new Promise(function(resolve, reject){
      if( pollers.update_devices) clearTimeout( pollers.update_devices);
      pollers['update_devices'] = setInterval(function(){
        //console.log('Update device list timer');
        get_devices()
          .then(update_devices);
        },device_list_refresh_interval*1000);

      if( pollers.update_devinfo) clearTimeout( pollers.update_devinfo);
      pollers['update_devinfo'] = setInterval(function(){
        //console.log('Update device info timer');
        get_devinfo()
          .then(update_devinfo)
          .then(get_variables);
        },device_info_refresh_interval*1000);

      resolve();
    });
  }

  function save_settings(){
    settings = _.object(_.map($('#settings').serializeArray(), _.values));
    localStorage.setItem("settings", JSON.stringify(settings));
    console.log( 'Saved settings:', settings);
  }

  function get_settings(){
    var new_settings;
    var saved_settings = localStorage.getItem("settings");
    var defaults = {
      "autoscroll": "onEvent",
      "lineends": "\\r\\n",
      "scrollbars": "false",
      "show-devadm": "true",
      "show-event": "true",
      "show-function": "true",
      "show-sentevent": "true",
      "show-stderr": "true",
      "show-stdin": "true",
      "show-stdout": "true",
      "show-timestamp": "true",
      "show-variable": "true",
      "subenter": "true"
    };

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

  function get_setting(name){
    var val = settings[name];
    if(val === 'true') val = true;
    else if(val === 'false') val = false;
    else if(val === '\\r\\n') val = '\r\n';
    else if(val === '\\n') val = '\n';
    else if(val === '\\r') val = '\r';
    return val;
  }

  function restore_settings(){
    // App settings
    try{
      current_device = JSON.parse(localStorage.getItem("current_device"));
    } catch(e){
      current_device = null;
    }

    console.log('restoring settings:', settings);

    // User settings modal and content show/hide settings
    _.each(settings, function(value, key){
      var $item = $('[name="'+key+'"]');
      if($item.attr('type') == 'radio'){
        $item.each(function(){
          $(this).prop('checked', $(this).val() == value);
          if($(this).parent().hasClass('btn')){
            $(this).parent().toggleClass('active', $(this).val() == value);
          }
        });
      } else{
        $item.val(value);
      }

      if ( key.slice(0,5) == 'show-' ) {
        var item_class = 'hide_' + key.slice(5);
        $('#content').toggleClass(item_class, value == 'false')
      }

      if(( key == 'scrollbars') && value === 'true'){
        $('html').removeClass('no-scroll-bars');
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
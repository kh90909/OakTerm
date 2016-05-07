var consts = {
  ERR_MINOR: 0,
  ERR_MAJOR: 1,
  ERR_FATAL: 2,
  ERR_LOGIN: 3
};

$(function() {
  var device_list_refresh_interval=10; // seconds
  var device_info_refresh_interval=10; // seconds
  var retry_promise_default_retries=3;
  var retry_promise_default_delay=1000; // milliseconds
  var claim_code = "";
  var claimed_devices = "";
  var all_devices;
  var current_device = {};
  var pollers = [];
  var device_vars = {};
  var device_functions = [];
  var settings = get_settings();
  var access_token = localStorage.getItem("access_token");
  var error_modal_active = false;

  var particle = new Particle();
  var activeStream;

  $('[data-toggle="tooltip"]').tooltip();

  if(access_token){
    do_login(true);
  }else{
    show_login();
  }

  function do_login(firstRun){
    // The promise chain is split into two arms after start_pollers so that
    // a MINOR_ERR in get_variables doesn't block subscribe_events

    var pr = login(firstRun)
      .then(login_success)
      .then(restore_settings)
      .then(retry_promise(get_devices,oakterm_error_handler))
      .then(update_devices)
      .then(retry_promise(get_devinfo,oakterm_error_handler))
      .then(update_devinfo)
      .then(start_pollers);

    pr.then(retry_promise(get_variables,oakterm_error_handler,0))
      .catch(oakterm_error_catch_at_end);

    pr.then(retry_promise(subscribe_events,oakterm_error_handler))
      .then(display_event)
      .catch(oakterm_error_catch_at_end);
  }

  function login(firstRun){
    var action;
    $('#login_error').hide();

    if(!firstRun){ // Login button clicked, so use email and pass
      var email = $('#login_email').val();
      var pass = $('#login_password').val();

      action = particle_login(email,pass);
    }
    else if(access_token){ // first run, so use access_token
      action = verify_token;
    }
    else{
      console.log('This should never happen: firstRun == True and no access_token in login(). Please report a bug.');
      return Promise.reject();
    }

    return Promise.resolve()
      .then(retry_promise(action,oakterm_error_handler));
  }

  function particle_login(email, pass){
    return function(){
      return particle.login({username: email, password: pass})
        .catch(inject_error(consts.ERR_LOGIN,'Login failed'));
    }
  }

  function verify_token(){
    return particle.listDevices({ auth: access_token })
      .catch(inject_error(consts.ERR_LOGIN,'Failed to verify access token'));
  }

  function show_login(){
    $('#terminal').fadeOut(150, function(){
      $('#login').fadeIn(150, set_heights);
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

  function get_devices(){
    var error_msg = 'Error getting a list of your devices from the Particle Cloud';
    return particle.listDevices({auth: access_token})
      .catch(inject_error(consts.ERR_FATAL,error_msg));
  }

  function dev_namestr(device){
    var name = "";
    if(device.name) name += device.name + ' ';
    name += '(' + device.id.slice(-6) + ')';
    return name;
  }

  function update_devices(devices){
    if(devices && (devices instanceof Error || devices.error || devices.OakTermErr)){
      console.log('update_devices(): called with error object',devices);
    }
    //console.log('Devices: ', devices);
    all_devices = devices.body;

    $("#deviceIDs").html('');

    _.each(all_devices, function(item, idx) {
      var name = dev_namestr(item);
      var curId = current_device ? current_device.id : false;
      var $opt = $('<option>', {value: item.id, selected: (curId == item.id), html: name });
      $("#deviceIDs").append($opt);
    });

    current_device = _.findWhere(all_devices, {id: $("#deviceIDs").val()} );
    if( current_device){
      localStorage.setItem("current_device", JSON.stringify(current_device));
    }
    return devices;
  }

  function get_devinfo(){
    var error_msg = 'Error getting device info via the Particle Cloud for device: ' + dev_namestr(current_device);
    return particle.getDevice({deviceId: current_device.id, auth: access_token})
      .catch(inject_error(consts.ERR_FATAL,error_msg));
  }

  function update_devinfo(data){
    if(data && (data instanceof Error || data.error || data.OakTermErr)){
      console.log('update_devinfo(): called with error object:',data);
    }
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
          $(document).on('click','[id="btn-'+item+'"]',promise_to_call_function);
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

  function promise_to_call_function(event){
    var name=this.id.slice(4);
    var arg=$('[id="arg-'+name+'"]').val();

    // Do not retry in case function actually gets called before triggering an
    // error. Need to confirm ParticleJS API calls are atomic before enabling
    // retries.
    Promise.resolve()
      .then(retry_promise(call_function,oakterm_error_handler,0))
      .then(dump_function(name,arg))
      .catch(oakterm_error_catch_at_end);

    $('[id="func-'+name+'"]').collapse('hide');

    function call_function(){
      return particle.callFunction({deviceId: current_device.id,
                             name: name,
                             argument: arg,
                             auth: access_token})
        .catch(inject_error(consts.ERR_MAJOR,'Error calling function via the Particle Cloud (function: ' + name + ')'))
    }
  }

  function dump_function(func,arg){
    return function(data){
      var result=data.body.return_value;
      var htmlstr='<div class="text_function">Function call ' +
                  func + '("' + arg + '") returned ' + result + '</div>';
      terminal_print(htmlstr);
    }
  }

  function inject_data(data){
    if(data && (data instanceof Error || data.error || data.OakTermErr)){
      console.log('inject_data(): called with error object:',data);
    }

    return function(data){
      data.body = data.body || {};
      data.body.OakTermData=data;
      return Promise.resolve(data);
    };
  }

  function inject_error(code,desc){
    return function(data){
      data.body = data.body || {};
      data.body.OakTermErr=code;
      data.body.OakTermErrDesc=desc;
      return Promise.reject(data);
    };
  }

  function oakterm_error_catch_at_end(data){
    if(!data.body || !('OakTermErr' in data.body)){
      console.log('oakterm_error_catch_at_end(): OakTermError key not found, leaving uncaught');
      return Promise.reject(data);
    }
    if(data.body.OakTermErrSilenced){
      console.log('oakterm_error_catch_at_end(): Catching silenced error:',data.body.OakTermErrDesc);
      return Promise.resolve(data);
    }
    console.log('oakterm_error_catch_at_end(): Rejecting on unsilenced error:', data);
    return Promise.reject(data);
  }

  function oakterm_error_handler(data){
    if(!data){
      console.log('oakterm_error_handler(): Called without arg');
    }
    if(!data.body || !('OakTermErr' in data.body)){
      console.log('oakterm_error_handler(): OakTermError key not found, leaving uncaught');
      return Promise.reject(data);
    }
    if(data.body.OakTermErrSilenced){
      return Promise.reject(data);
    }
    if(error_modal_active){
      data.body.OakTermErrSilenced = true;
      data.body.OakTermDoNotRepeat = true;
      console.log('oakterm_error_handler(): Silenced error due to modal being active: ' + data.body.OakTermErrDesc + '.');
      return Promise.reject(data);
    }

    var api_err_desc = data.body.error_description || '';
    var colon_api_err_desc = '';
    if(api_err_desc != ''){
      //api_err_desc += '.';
      colon_api_err_desc = ': ' + api_err_desc;
    }
    if(data.body.OakTermErr == consts.ERR_LOGIN){
      console.log('Login error: ', data.body.OakTermErrDesc + colon_api_err_desc);
      $('#login_button').attr('disabled',false);
      $('#login_error').html(data.body.OakTermErrDesc + colon_api_err_desc);
      $('#login_error').show();

      if(data.body.error == 'invalid_token'){
        localStorage.removeItem("access_token");
      }
      data.body.OakTermErrSilenced = true;
      data.body.OakTermDoNotRepeat = true;
      show_login();
      return Promise.reject(data);
    }
    else if(data.body.OakTermErr == consts.ERR_MINOR){
      console.log('Minor error: ', data.body.OakTermErrDesc + colon_api_err_desc);
      data.body.OakTermErrSilenced = true;
      data.body.OakTermDoNotRepeat = true;
      return Promise.reject(data);
    } else if(data.body.OakTermErr == consts.ERR_MAJOR){
      var htmlstr='<div class="text_stderr">' + data.body.OakTermErrDesc +
                  '. ' + api_err_desc + '</div>'
      terminal_print(htmlstr);
      console.log('Major error: ', data.body.OakTermErrDesc + colon_api_err_desc);
      data.body.OakTermErrSilenced = true;
      data.body.OakTermDoNotRepeat = true;
      return Promise.reject(data);
    } else if(data.body.OakTermErr == consts.ERR_FATAL){
      error_modal_active = true;
      stream_was_active = activeStream && activeStream.active;
      console.log('Fatal error: ', data.body.OakTermErrDesc + colon_api_err_desc);
      stop_pollers();
      stop_stream();
      $('#modal-error-message').html(data.body.OakTermErrDesc + '. ' + api_err_desc);
      var promise = new Promise(function(resolve, reject){
        $('#modal-error-retry-button').on('click',function(){
          $('#modal-error-retry-button').off('click');
          error_modal_active = false;
          console.log('oakterm_error_handler.on(\'click\',\'#modal-error-retry-button\')(): Clicked retry.')
          if(stream_was_active){
            // Only do subscribe_events() if the event stream was active before
            // the fatal error. Otherwise, if the error resulted from
            // subscribe_events(), we would try to subscribe here and again
            // after the reject() below causes retry_promise to retry the
            // subscribe_events() call that generated the error.
            Promise.resolve()
              .then(retry_promise(subscribe_events,oakterm_error_handler))
              .then(display_event)
              .catch(oakterm_error_catch_at_end);
          }
          start_pollers();
          reject();
        });
      });
      console.log('oakterm_error_handler(): Showing modal and waiting for promise to resolve on close');
      $('#modal-error').modal('show');
      return promise;
    }
  }

  function delayed_reject(milliseconds){
    return function(data){
      return new Promise(function(resolve,reject){
        if(error_modal_active){
          reject(data);
        }else{
          setTimeout(function(){ reject(data); },milliseconds);
        }
      });
    };
  }

  function retry_promise(async_func,error_func,retries,delay) {
    retries = typeof retries !== 'undefined' ? retries : retry_promise_default_retries;
    delay = typeof delay !== 'undefined' ? delay : retry_promise_default_delay;

    function async_caller(data){
      if(error_modal_active){
        return Promise.reject(data);
      }
      return async_func();
    }
    return function retrier(data){
      if(data && data.body && data.body.OakTermDoNotRepeat) {
        console.log('retry_promise.retrier(): Rejecting because DoNotRepeat flag set');
        return Promise.reject(data);
      }
      if(data && (data instanceof Error || data.error || data.OakTermErr)){
        console.log('retry_promise.retrier(): called with error object:',data);
      }
      if(error_modal_active){
        console.log('retry_promise.retrier(): Resolving because error_modal_active');
        return Promise.resolve(data);
      }
      var p = async_func();
      for(var i = 0; i < retries; i++) {
        p = p.catch(delayed_reject(delay)).catch(async_caller);
      }
      p = p.catch(error_func).catch(retrier);

      return p;
    }
  }

  $('#modal-error-logout-button').click(logout);

/*  function on_fatal_error(data){
    error_modal_active = true;
    stop_pollers();
    $('#modal-error-message').html(data.body.OakTermErrDesc + '. ' + data.body.error_description);
    var promise = new Promise(function(resolve, reject){
      $('#modal-error-retry-button').on('click',function(){
        error_modal_active = false;
        start_pollers();
        $('#modal-error-retry-button').off('click');
        reject(data);
      });
    });
    console.log('on_fatal_error(): Showing modal and waiting for promise to resolve on close');
    $('#modal-error').modal('show');
    return promise;
  }*/

  function get_variable(name){
    return function(data) {
      if(data && (data instanceof Error || data.error || data.OakTermErr)){
        console.log('get_variable.anon(): called with error object:',data);
      }
      return particle.getVariable({deviceId: current_device.id, name: name,
                     auth: access_token})
        .then(update_variable)
        .catch(inject_error(consts.ERR_MINOR,'Error getting variable value via the Particle Cloud (variable: ' + name + ')'));
    }
  }

  function get_and_dump_variable(event){
    Promise.resolve()
      .then(retry_promise(get_variable(event.target.dataset.variable),oakterm_error_handler,0))
      .then(dump_variable)
      .catch(oakterm_error_catch_at_end);
  }

  function get_variables(data){
    if(data && (data instanceof Error || data.error || data.OakTermErr)){
      console.log('get_variables(): called with error object:',data);
    }

    var promise=Promise.resolve();
    _.each(device_vars, function(variable, name) {
      promise=promise.then(get_variable(name));
    });
    return promise;
  }

  function update_variable(data){
    if(data && (data instanceof Error || data.error || data.OakTermErr)){
      console.log('update_variable(): called with error object:',data);
    }

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
    if(data && (data instanceof Error || data.error || data.OakTermErr)){
      console.log('dump_variable(): called with error object:',data);
    }

    var device_var = device_vars[data.body.name];
    var htmlstr='<div class="text_variable">Variable ' +
                data.body.name +': ' + device_var.value +
                ' <span class="var-type-' + device_var.type + '">(' +
                device_var.type+')</span></div>';

    terminal_print(htmlstr);
  }
  function subscribe_events(data){
    if(data && (data instanceof Error || data.error || data.OakTermErr)){
      console.log('subscribe_events(): called with error object:',data);
    }
    var error_msg = 'Error subscribing to the Particle Cloud event stream for device: ' + dev_namestr(current_device);
    return particle.getEventStream({deviceId: current_device.id,auth: access_token})
      .catch(inject_error(consts.ERR_FATAL,error_msg));

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
    if(stream && (stream instanceof Error || stream.error || stream.OakTermErr)){
      console.log('display_event(): called with error object:',stream);
    }

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
        case 'spark/status':
          if(event.data == 'online'){
            console.log('Detected spark/status - online event. Refreshing info and vars');
            refresh_devinfo();
          }
          // No break since we want to fall through and display this event
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

  $("#reboot-all").click(function(e){
    e.preventDefault();
    promise_to_send_cmd("reboot");
  });

  $("#reboot-current").click(function(e){
    e.preventDefault();
    promise_to_send_cmd("reboot");
  });

  $("#configmode").click(function(){
    promise_to_send_cmd("config mode");
  });

  $("#usermode").click(function(){
    promise_to_send_cmd("user mode");
  });

  $("#logout").click(logout);

  function logout(){
    localStorage.removeItem("access_token");
    localStorage.removeItem("current_device");
    location.reload();
  }

  $("#refresh").click(function(){
    refresh_devices();
    refresh_devinfo();
  });

  $("#modal-send-event-button").click(function(){
    // Do not retry in case event actually gets sent before triggering an
    // error. Need to confirm ParticleJS API calls are atomic before enabling
    // retries.
    Promise.resolve()
      .then(retry_promise(send_event,oakterm_error_handler,0))
      .then(dump_sent_event)
      .catch(oakterm_error_catch_at_end);

    function send_event(){
      var event={ name: $('#event-name').val(),
                  data: $('#event-data').val(),
                  isPrivate: $('#event-private').prop('checked')};

      var error_msg = 'Error sending event: ' + JSON.stringify(event);

      event.auth = access_token; // Add access token after generating error msg
                                 // since we don't want to print it for security
                                 // reasons.
      console.log('Sending event:', event);
      return particle.publishEvent(event)
        .then(inject_data({event:event}))
        .catch(inject_error(consts.ERR_MAJOR,error_msg))
    }
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

  $(document).on('click', '#varstable [data-variable]', get_and_dump_variable);

  $("#deviceIDs").on('change',function(){
    current_device= _.findWhere(all_devices, {id: this.value});
    localStorage.setItem("current_device", JSON.stringify(current_device));

    stop_stream();

    var htmlStr = '<div class="text_devadm">Device change: '+current_device.name+'</div>';
    terminal_print(htmlStr);

    $('#devtable tbody').html('');

    // The promise chain is split into two arms after update_devinfo so that
    // a MINOR_ERR in get_variables doesn't block subscribe_events
    var pr = Promise.resolve()
      .then(retry_promise(get_devinfo,oakterm_error_handler))
      .then(update_devinfo);

    pr.then(retry_promise(get_variables,oakterm_error_handler,0))
      .catch(oakterm_error_catch_at_end);

    pr.then(retry_promise(subscribe_events,oakterm_error_handler))
      .then(display_event)
      .catch(oakterm_error_catch_at_end);

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

  $('#file-input').on('change',promise_to_send_file);

  $('#send-data-form').on('submit', function(e){
    e.preventDefault();
    promise_to_send_data($("#senddata").val());
  });

  $('#send-data-form [data-submit]').on('click', function(){
    $(this).parents('form').submit();
  });

  $('#send-data-form input').on('keypress', function(e){
    if( (e.which == 13) && !get_setting('subenter')) e.preventDefault();
  });

  function promise_to_send_file(e){
    var file;
    if(e.target.files && e.target.files[0]){
      var file = e.target.files[0];
    }else{
      return; // Notify file not found error?
    }

    Promise.resolve()
      .then(retry_promise(send_file,oakterm_error_handler,0))
      .catch(oakterm_error_catch_at_end);

    function send_file(){
      return new Promise(function(resolve,reject){
        console.log('send_file(e): e:',e);
        var offset = 0;
        var slice_len = 255;
        var p = Promise.resolve();

        // Disable user "Send Data" button so that it's not possible to send
        // in the middle of the file upload
        $("#send-data-form [type='submit']").addClass('disabled');
        slice_reader();

        function slice_reader(){
          var reader = new FileReader();
          var slice = file.slice(offset,offset+slice_len);

          reader.onload = read_handler;
          reader.onerror = read_error_handler;
          reader.readAsBinaryString(slice);
        };

        function read_handler(e){
          p = p.then(send_data(e.target.result))
               .then(next_slice)
               .catch(function(){
                 e.body = e.body || {}
                 e.body.OakTermErr = consts.ERR_MAJOR;
                 e.body.OakTermErrDesc = 'Upload file failed. Error sending data to your device via the Particle Cloud';
                 reject(e);
               });
        }

        function next_slice(){
          offset+=slice_len;
          if(offset >= file.size){
            reset_ui();
            resolve();
          }else{
            setTimeout(slice_reader,1000);
          }
        }

        function read_error_handler(e){
            e.body = e.body || {}
            e.body.OakTermErr = consts.ERR_MAJOR;
            e.body.OakTermErrDesc = 'Upload file failed. Error reading file from your computer';
            console.log('Error reading file: ' + e.target.error);
            reset_ui();
            reject(e);
        }

        function reset_ui(){
            $('#file-input').val(null);
            $("#send-data-form [type='submit']").removeClass('disabled');
        }
      });
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
      promise_to_rename_device(newName);
      $modal.modal('hide');
    }
  });

  function stop_stream(stream){
    stream = stream || activeStream;
    if(stream && stream.active){
      console.log('stop_stream(): Stopping stream.');
      stream.abort();
      $('[data-stream-active]').attr('data-stream-active', false); // Necessary? we don't set data-stream-active true anywhere.
      activeStream = null;
      return activeStream;
    } else {
      console.log('stop_stream(): No stream active to stop.');
    }
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

  function promise_to_send_cmd(cmd){
    // Do not retry in case command actually gets sent before triggering an
    // error. Need to confirm ParticleJS API calls are atomic before enabling
    // retries.
    Promise.resolve()
      .then(retry_promise(send_cmd,oakterm_error_handler,0))
      .catch(oakterm_error_catch_at_end);

    function send_cmd(){
      var error_msg = 'Error sending command \'' + cmd + '\' to your device via the Particle Cloud';
      console.log("Sending Command: " + cmd);
      return particle.publishEvent({name: 'oak/device/reset/' + current_device.id, data: cmd, isPrivate: true, auth: access_token})
        .catch(inject_error(consts.ERR_MAJOR,error_msg));
    }
  }

  function promise_to_send_data(data){
    var htmlstr='<div class="text_stdin">'+ data + '</div>';

    // Do not retry in case data actually gets sent before triggering an
    // error. Need to confirm ParticleJS API calls are atomic before enabling
    // retries.
    Promise.resolve()
      .then(retry_promise(send_data(data),oakterm_error_handler,0))
      .then(function(){terminal_print(htmlstr);})
      .catch(oakterm_error_catch_at_end);
  }

  function send_data(data){
    return function(){
      var error_msg = 'Error sending data to your device via the Particle Cloud';
      var lineEnd = get_setting('lineends');
      if(lineEnd) data += lineEnd;
      console.log("Sending Data: " + data);
      return particle.publishEvent({name: 'oak/device/stdin/' + current_device.id, data: data, isPrivate: true, auth: access_token})
        .catch(inject_error(consts.ERR_MAJOR,error_msg));
    }
  }

  function promise_to_rename_device(newName){
    var oldName = current_device.name;
    Promise.resolve()
      .then(retry_promise(rename_device,oakterm_error_handler,0))
      .then(dump_rename_device)
      .then(update_devices)
      .catch(oakterm_error_catch_at_end);

    function rename_device(){
      var oldName = current_device.name;
      return particle.renameDevice({deviceId: current_device.id, name: newName, auth: access_token })
        .then(function(device){
          current_device.name = device.body.name;
          device.body = all_devices;
          return device;
        })
        .catch(inject_error(consts.ERR_MAJOR,'Failed to rename device'));
    }

    function dump_rename_device(device){
      var newName = current_device.name;
      var htmlstr = '<div class="text_devadm">Device Rename: '+oldName+' to '+newName+'</div>';
      terminal_print(htmlstr);
      return device;
    }
  }

  function refresh_devices(){
    var promise=Promise.resolve();
    promise.then(retry_promise(get_devices,oakterm_error_handler))
      .then(update_devices)
      .catch(oakterm_error_catch_at_end);
  }

  function refresh_devinfo(){
    Promise.resolve()
      .then(retry_promise(get_devinfo,oakterm_error_handler))
      .then(update_devinfo)
      .then(retry_promise(get_variables,oakterm_error_handler,0))
      .catch(oakterm_error_catch_at_end);
  }

  function start_pollers(data){
    if(data && (data instanceof Error || data.error || data.OakTermErr)){
      console.log('start_pollers(): called with error object:',data);
    }

    console.log('start_pollers(): Starting pollers.');
    if( pollers.update_devices) clearInterval( pollers.update_devices);
    pollers['update_devices'] = setInterval(refresh_devices,device_list_refresh_interval*1000);

    if( pollers.update_devinfo) clearInterval( pollers.update_devinfo);
    pollers['update_devinfo'] = setInterval(refresh_devinfo,device_info_refresh_interval*1000);
  }

  function stop_pollers(){
    console.log('stop_pollers(): Stopping pollers.');
    if( pollers.update_devices) clearInterval( pollers.update_devices);
    if( pollers.update_devinfo) clearInterval( pollers.update_devinfo);
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
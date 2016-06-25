
void event_handler(const char *event, const char *data) {
  // Print the received event to OakTerm
  Particle.println("Received event name \"" + String(event) + "\"" + \
                   " and data \"" + String(data) + "\"");
}

void setup() {
  bool status;

  // Initialize cloud serial
  Particle.begin();

  // Subscribe to all events associated with your
  // Particle account, i.e. published by devices
  // you have associated with that account or
  // sent by OakTerm when you are signed in with
  // that account
  status=Particle.subscribe("oakterm",event_handler,MY_DEVICES);

  // Event subscription can fail, so it's a good idea to check
  // the return status
  if(status)
    Particle.println("Particle.subscribe(\"oakterm\",event_handler,MY_DEVICES) succeeded");
  else
    Particle.println("Particle.subscribe(\"oakterm\",event_handler,MY_DEVICES) failed");
}

void loop() {
}

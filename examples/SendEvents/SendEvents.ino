// Variable definitions
int counter=0;

void setup() {
}

void loop() {
  // Publish an event with name "oakterm/test/status" and data
  // "The counter is now <n>", where <n> is the value of the
  // counter variable
  String data="The counter is now " + String(counter);
  Particle.publish("oakterm/test/status",data.c_str(),PRIVATE);
  counter++;

  // Wait 5000 ms (i.e. 5 s) before repeating
  delay(5000);
}

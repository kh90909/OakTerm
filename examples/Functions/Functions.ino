int my_func_a(String arg) {
  return Particle.println("my_func_a was called with argument \"" + arg + "\"");
}

int my_func_b(String arg) {
  return Particle.println("my_func_b was called with argument \"" + arg + "\"");
}

void setup() {
  bool status;

  Particle.begin();

  // Register the my_func_a function with the Particle Cloud under
  // the name "my_func_a". Note that this name doesn't have to be
  // the same as the name of the function, and it must be limited
  // to a maximum of 12 characters
  status=Particle.function("my_func_a",my_func_a);

  // Variable registration can fail, so it's a good idea to check
  // the return status
  if(status)
    Particle.println("Particle.function(\"my_func_a\",my_func_a) succeeded");
  else
    Particle.println("Particle.function(\"my_func_a\",my_func_a) failed");

  status=Particle.function("my_func_b",my_func_b);

  // Register the my_func_b function and check the return status
  if(status)
    Particle.println("Particle.function(\"my_func_b\",my_func_b) succeeded");
  else
    Particle.println("Particle.function(\"my_func_b\",my_func_b) failed");
}

void loop() {
}

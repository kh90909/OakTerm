// Note: if you have difficultly with the later variable registrations
// failing, see this forum post for suggestions:
// https://digistump.com/board/index.php/topic,2302.0.html#msg10770

// Variable definitions

int  my_int=1;
double my_double=1.1;
char my_string[]="abcdefgh";

void setup() {
  bool status;

  // Initialize cloud serial
  Particle.begin();

  // Register the my_int variable with the Particle Cloud under
  // the name "my_int". Note that this name doesn't have to be
  // the same as the name of the variable, and it must be limited
  // to a maximum of 12 characters
  status=Particle.variable("my_int",my_int);

  // Variable registration can fail, so it's a good idea to check
  // the return status
  if(status)
    Particle.println("Particle.variable(\"my_int\",my_int) succeeded");
  else
    Particle.println("Particle.variable(\"my_int\",my_int) failed");

  // Register the my_double variable and check the return status
  status=Particle.variable("my_double",my_double);
  if(status)
    Particle.println("Particle.variable(\"my_double\",my_double) succeeded");
  else
    Particle.println("Particle.variable(\"my_double\",my_double) failed");

  // Register the my_string variable and check the return status
  status=Particle.variable("my_string",my_string);
  if(status)
    Particle.println("Particle.variable(\"my_string\",my_string) succeeded");
  else
    Particle.println("Particle.variable(\"my_string\",my_string) failed");
}

// Arduino doesn't include a function to print a floating point
// number, so this function does that. Precision determines the
// number of decimal places:
//      1 = zero decimal places
//     10 = one decimal place
//    100 = two decimal places
//   1000 = three decimal places
//    etc
void printDouble(double d,int precision) {
  // Multiply by precision so that all of the required digits
  // are on the left of the decimal point, then round to
  // discard everything else and round up/down as appropriate
  int i=round(d*precision);

  // Divide by precision to get the integer part. As i and
  // precision are both integers, this is integer division so
  // any fractional part of the result is discarded.
  Particle.print(i/precision);
  Particle.print('.');

  // If the number is negative, we've already printed the sign
  // above, so remove it now
  if(i<0)
    i=-i;

  // Subtract the integer part to get the fractional part
  // (multiplied by precision)
  Particle.print(i-(i/precision)*precision);
}

void loop() {
  // Repeat every 10000 ms (i.e. 10 s)
  delay(10000);

  // Note that OakTerm only updates
  // its display of the variable values
  // every 10 s, so if you change them
  // more frequently that that, you'll
  // need to press the refresh button
  // in OakTerm to update the values.

  // Increment the variable values and
  // print them out to OakTerm
  my_int++;
  Particle.print("Set my_int to ");
  Particle.println(my_int);

  my_double+=1.1;
  Particle.print("Set my_double to ");
  printDouble(my_double,10);
  Particle.print('\n');

  for(int i=0;i<8;i++) {
    my_string[i]++;
    if(my_string[i]>'z')
      my_string[i]='a';
  }
  Particle.print("Set my_string to ");
  Particle.println(my_string);
}

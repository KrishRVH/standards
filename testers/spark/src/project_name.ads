package Project_Name
  with SPARK_Mode => On
is
   subtype Factor is Natural range 0 .. 50;
   subtype Product is Natural range 0 .. 100;

   function Double (Value : Factor) return Product
   with
     Global  => null,
     Depends => (Double'Result => Value),
     Post    => Double'Result = Value * 2;
end Project_Name;

package body Project_Name
  with SPARK_Mode => On
is
   function Double (Value : Factor) return Product is
   begin
      return Value * 2;
   end Double;
end Project_Name;

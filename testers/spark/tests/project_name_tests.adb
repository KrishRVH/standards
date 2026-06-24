with Project_Name;

procedure Project_Name_Tests with SPARK_Mode => On is
begin
   pragma Assert (Project_Name.Double (0) = 0);
   pragma Assert (Project_Name.Double (21) = 42);
   pragma Assert (Project_Name.Double (50) = 100);
end Project_Name_Tests;

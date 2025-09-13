{
  testBasicMath = {
    expr = 2 + 3;
    expected = 6;  # This will fail - 2+3 = 5, not 6
  };

  testStringConcatenation = {
    expr = "hello" + "world";
    expected = "hello world";  # This will fail - no space in concatenation
  };

  testListLength = {
    expr = builtins.length [1 2 3 4];
    expected = 3;  # This will fail - list has 4 elements, not 3
  };
}
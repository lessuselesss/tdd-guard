{
  testBasicMath = {
    expr = 2 + 3;
    expected = 5;
  };

  testStringConcatenation = {
    expr = "hello" + "world";
    expected = "helloworld";
  };

  testListLength = {
    expr = builtins.length [1 2 3];
    expected = 3;
  };

  testBooleanLogic = {
    expr = true && true;
    expected = true;
  };
}
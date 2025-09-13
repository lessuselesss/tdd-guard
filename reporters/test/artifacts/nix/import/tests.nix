{
  testWithNonExistentFunction = {
    expr = nonExistentFunction 42;  # This will cause an evaluation error
    expected = 42;
  };

  testWithBadSyntax = {
    expr = let x = in x;  # Syntax error - missing value after "="
    expected = "whatever";
  };

  testWithUndefinedVariable = {
    expr = undefinedVariable + 1;  # Reference to undefined variable
    expected = 1;
  };
}
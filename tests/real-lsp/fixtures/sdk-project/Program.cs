var greeter = new Greeter();
Console.WriteLine(greeter.Message());

public sealed class Greeter
{
    public string Message()
    {
        return "hello";
    }
}

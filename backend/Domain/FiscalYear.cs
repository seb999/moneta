namespace Moneta.Api.Domain;

public class FiscalYear
{
    public int Year { get; set; }
    public string Status { get; set; } = "open"; // open | closed

    public ICollection<PaymentRef> PaymentRefs { get; set; } = [];
}

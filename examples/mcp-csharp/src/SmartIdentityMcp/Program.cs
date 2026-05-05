using System.ComponentModel;
using System.Globalization;
using ModelContextProtocol.Server;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddMcpServer().WithHttpTransport(options => options.Stateless = true).WithTools<SmartIdentityTools>();
var app = builder.Build();
app.MapGet("/", () => "healthy");
app.MapGet("/favicon.ico", () => Results.NoContent());
app.MapMcp("/mcp");
app.Run();

[McpServerToolType]
public class SmartIdentityTools
{
    [McpServerTool(Name = "get_version")]
    [Description("Returns SmartIdentity MCP version")]
    public string GetVersion() => "smartidentity_v1";

    [McpServerTool(Name = "get_report_data")]
    [Description("Returns simulated SmartIdentity report data for a report name and date range")]
    public ReportData GetReportData(
        [Description("Start date/time for the report range")] DateTime from,
        [Description("End date/time for the report range")] DateTime to,
        [Description("Name of the report to return")] string reportName)
    {
        if (to < from)
        {
            throw new ArgumentException("'to' must be greater than or equal to 'from'.");
        }

        var seed = Math.Abs(HashCode.Combine(reportName, from.Date, to.Date));
        var days = Math.Min((to.Date - from.Date).Days + 1, 31);
        var rows = Enumerable.Range(0, days)
            .Select(index =>
            {
                var date = from.Date.AddDays(index);
                var value = 1000 + ((seed + index * 137) % 5000);
                return new ReportDataItem(new ReportRow(
                    date.ToString("M/d/yyyy", CultureInfo.InvariantCulture),
                    value));
            })
            .ToList();

        return new ReportData(reportName, rows);
    }
}

public sealed record ReportData(string Title, List<ReportDataItem> Data);

public sealed record ReportDataItem(ReportRow Row);

public sealed record ReportRow(string Date, int Value);

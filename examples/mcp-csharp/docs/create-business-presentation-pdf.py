from pathlib import Path

from PIL import Image as PILImage
from reportlab.graphics.shapes import Drawing, Line, Polygon, Rect, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Image, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parents[4]
OUTPUT = ROOT / "output" / "pdf" / "global-gateway-mcp-business-presentation.pdf"
DASHBOARD = ROOT / "output" / "playwright" / "smartroom-dashboard.png"

PAGE_SIZE = landscape(A4)
PAGE_W, PAGE_H = PAGE_SIZE
MARGIN = 36
CONTENT_W = PAGE_W - 2 * MARGIN

BLUE = colors.HexColor("#003b73")
CYAN = colors.HexColor("#00a0e3")
GREEN = colors.HexColor("#27864f")
ORANGE = colors.HexColor("#f59e0b")
RED = colors.HexColor("#b42318")
LINE = colors.HexColor("#8aa7c5")
DARK = colors.HexColor("#30343b")
GRAY = colors.HexColor("#f5f7fa")


def build_styles():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle("DeckTitle2", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=29, leading=34, textColor=BLUE, alignment=TA_LEFT, spaceAfter=16))
    styles.add(ParagraphStyle("SlideTitle2", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=21, leading=25, textColor=BLUE, spaceAfter=12))
    styles.add(ParagraphStyle("BodyLarge2", parent=styles["BodyText"], fontName="Helvetica", fontSize=12.5, leading=17, textColor=DARK, spaceAfter=8))
    styles.add(ParagraphStyle("DeckBullet2", parent=styles["BodyText"], fontName="Helvetica", fontSize=11.5, leading=15.5, leftIndent=14, bulletIndent=0, textColor=DARK, spaceAfter=5))
    styles.add(ParagraphStyle("Small2", parent=styles["BodyText"], fontName="Helvetica", fontSize=8.5, leading=10.5, textColor=DARK))
    styles.add(ParagraphStyle("Callout2", parent=styles["BodyText"], fontName="Helvetica-Bold", fontSize=13, leading=17, textColor=colors.white, alignment=TA_CENTER))
    return styles


STYLES = build_styles()


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#d7dde5"))
    canvas.line(MARGIN, 24, PAGE_W - MARGIN, 24)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#667085"))
    canvas.drawString(MARGIN, 12, "Global Gateway MCP Architecture | Business presentation")
    canvas.drawRightString(PAGE_W - MARGIN, 12, f"Page {doc.page}")
    canvas.restoreState()


def bullet(text):
    return Paragraph(text, STYLES["DeckBullet2"], bulletText="-")


def table(rows, widths, header_color=BLUE):
    result = Table([[Paragraph(c, STYLES["Small2"]) for c in row] for row in rows], colWidths=widths)
    result.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), header_color),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d0d5dd")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return result


def architecture_diagram():
    drawing = Drawing(CONTENT_W, 365)

    def box(x, y, w, h, label, fill=GRAY, stroke=LINE, text=DARK, size=10):
        drawing.add(Rect(x, y, w, h, rx=6, ry=6, fillColor=fill, strokeColor=stroke, strokeWidth=1.2))
        lines = label.split("\n")
        for i, line in enumerate(lines):
            drawing.add(String(x + w / 2, y + h / 2 + (len(lines) - 1) * 6 - i * 12, line, textAnchor="middle", fontName="Helvetica-Bold" if i == 0 else "Helvetica", fontSize=size, fillColor=text))

    def arrow(x1, y1, x2, y2, color=LINE):
        drawing.add(Line(x1, y1, x2, y2, strokeColor=color, strokeWidth=1.4))
        direction = 1 if x2 >= x1 else -1
        drawing.add(Polygon([x2, y2, x2 - 8 * direction, y2 + 4, x2 - 8 * direction, y2 - 4], fillColor=color, strokeColor=color))

    box(10, 235, 125, 62, "AI Assistant\nClaude / VS Code", colors.HexColor("#e8f3fb"), CYAN, BLUE)
    box(180, 235, 132, 62, "Global MCP\nGateway", colors.HexColor("#dbeafe"), BLUE, BLUE)
    box(357, 300, 138, 52, "SmartRoom MCP\nReports and data", colors.HexColor("#ecfdf3"), GREEN, GREEN)
    box(357, 220, 138, 52, "SmartIdentity MCP\nIdentity reports", colors.HexColor("#fff7ed"), ORANGE, ORANGE)
    box(357, 140, 138, 52, "Future MCP\nDomain servers")
    box(180, 80, 132, 48, "Gateway policy\nScopes / roles", colors.HexColor("#eef4ff"), LINE, BLUE, 9)
    box(10, 80, 125, 48, "Identity provider\nOAuth / OIDC", colors.HexColor("#fef3f2"), RED, RED, 9)
    box(535, 220, 140, 64, "Audit trail\ncorrelationId\nstart / end / error", colors.HexColor("#f8fafc"), LINE, DARK, 9)

    arrow(135, 266, 180, 266, CYAN)
    arrow(246, 235, 246, 128, LINE)
    arrow(312, 266, 357, 326, GREEN)
    arrow(312, 266, 357, 246, ORANGE)
    arrow(312, 266, 357, 166, LINE)
    arrow(72, 128, 72, 235, RED)
    arrow(135, 104, 180, 104, RED)
    arrow(495, 326, 535, 252, GREEN)
    arrow(495, 246, 535, 252, ORANGE)
    arrow(495, 166, 535, 252, LINE)
    return drawing


def build_story():
    story = []
    story.append(Spacer(1, 0.35 * inch))
    story.append(Paragraph("Global Gateway MCP Server", STYLES["DeckTitle2"]))
    story.append(Paragraph("Business architecture for governed AI assistant access to SmartRoom, SmartIdentity, and future sub-MCP services.", STYLES["BodyLarge2"]))
    story.append(Spacer(1, 0.3 * inch))
    summary = Table([[Paragraph("Single controlled entry point", STYLES["Callout2"]), Paragraph("Auditable assistant actions", STYLES["Callout2"]), Paragraph("Domain-owned subservers", STYLES["Callout2"])]], colWidths=[CONTENT_W / 3 - 8] * 3)
    summary.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), BLUE), ("BACKGROUND", (1, 0), (1, 0), CYAN), ("BACKGROUND", (2, 0), (2, 0), GREEN),
        ("INNERGRID", (0, 0), (-1, -1), 8, colors.white), ("TOPPADDING", (0, 0), (-1, -1), 20), ("BOTTOMPADDING", (0, 0), (-1, -1), 20),
    ]))
    story.append(summary)
    story.append(Spacer(1, 0.35 * inch))
    for item in [
        "AI assistants call one global MCP endpoint instead of directly reaching every business system.",
        "The gateway authenticates users, applies policy, creates correlation IDs, and forwards approved calls.",
        "SmartRoom and SmartIdentity keep ownership of their domain tools, reporting, and detailed access rules.",
    ]:
        story.append(bullet(item))
    story.append(PageBreak())

    story.append(Paragraph("Architecture Overview", STYLES["SlideTitle2"]))
    story.append(architecture_diagram())
    story.append(Paragraph("The gateway is the public boundary. Sub-MCP servers remain domain owned and can enforce their own method-level claims.", STYLES["BodyLarge2"]))
    story.append(PageBreak())

    story.append(Paragraph("Authentication And Bearer Token Reuse", STYLES["SlideTitle2"]))
    story.append(table([
        ["Step", "Business meaning"],
        ["1. Assistant signs in", "The user or application obtains a bearer token from SmartIdentity or the configured identity provider."],
        ["2. Gateway validates token", "Issuer, audience, and required scopes are checked before the MCP call is accepted."],
        ["3. Gateway forwards approved call", "The original bearer token is reused when the gateway calls SmartRoom MCP or SmartIdentity MCP."],
        ["4. Subserver may validate claims", "Domain services can make their own final decision using scope, role, tenant, or organization claims."],
    ], [180, CONTENT_W - 180]))
    story.append(Spacer(1, 0.18 * inch))
    for item in ["Identity remains visible from assistant request to domain action.", "Subservers do not need a separate credential model for AI clients.", "A subserver can still reject a call even when the gateway allowed broad access."]:
        story.append(bullet(item))
    story.append(PageBreak())

    story.append(Paragraph("Audit Trail And Explainability", STYLES["SlideTitle2"]))
    story.append(Paragraph("Every assistant action should be reconstructable after the fact. The gateway creates one correlationId for each tool call and passes it to the selected sub-MCP server.", STYLES["BodyLarge2"]))
    story.append(table([
        ["Audit field", "Why it matters"],
        ["correlationId", "Connects gateway logs, subserver logs, and the final assistant answer."],
        ["userId / clientId", "Shows who or what initiated the action."],
        ["toolName and server", "Shows which MCP method was requested and where it executed."],
        ["authorizationDecision", "Shows whether the action was allowed or denied, and where that decision happened."],
        ["status and error", "Captures start, end, and failure events for operational support and compliance."],
    ], [170, CONTENT_W - 170], CYAN))
    story.append(Spacer(1, 0.16 * inch))
    story.append(Paragraph("Business outcome: Claude or another assistant can answer business questions, while each action remains transparent, reviewable, and defensible.", STYLES["BodyLarge2"]))
    story.append(PageBreak())

    story.append(Paragraph("Authorization Model", STYLES["SlideTitle2"]))
    story.append(table([
        ["Layer", "Best used for", "Example"],
        ["Gateway level", "Central governance, visible tool list, broad policy, fast blocking of risky methods", "scope=nextgenAPI can call SmartRoom tools; scope=crpProfilerAPI can call SmartIdentity tools"],
        ["Sub-MCP method level", "Domain-specific rules, data-level security, tenant checks, defense in depth", "role=SmartRoom.Report.Reader for reports; role=Identity.Report.Reader for identity reports"],
    ], [125, 270, CONTENT_W - 395]))
    story.append(Spacer(1, 0.2 * inch))
    for item in ["Recommended production posture: use both layers.", "Gateway controls assistant entry and method exposure.", "Subservers protect domain data using claims, roles, and tenant context."]:
        story.append(bullet(item))
    story.append(PageBreak())

    story.append(Paragraph("Example Governance Matrix", STYLES["SlideTitle2"]))
    story.append(table([
        ["MCP server", "Method", "Gateway policy", "Optional subserver policy", "Audit"],
        ["SmartRoom", "get_smartrooms_data", "scope=nextgenAPI", "role=SmartRoom.Report.Reader", "Required"],
        ["SmartIdentity", "get_report_data", "scope=crpProfilerAPI", "role=Identity.Report.Reader", "Required"],
        ["Gateway", "gateway_get_configuration", "Admin or operator claim", "Not applicable", "Required"],
        ["Gateway", "gateway_add_configuration", "Gateway admin claim", "Not applicable", "Required"],
        ["Gateway", "gateway_restart", "Gateway admin claim", "Not applicable", "Required"],
    ], [110, 150, 180, 210, 80]))
    story.append(Spacer(1, 0.18 * inch))
    story.append(Paragraph("The matrix can become the control catalog for MCP onboarding, reviews, and access approvals.", STYLES["BodyLarge2"]))
    story.append(PageBreak())

    story.append(Paragraph("Final Example: SmartRoom Business Dashboard", STYLES["SlideTitle2"]))
    story.append(Paragraph("The SmartRoom MCP report data can power business-facing dashboards that show smartroom counts, users per room, and identity trends while preserving gateway auditability.", STYLES["BodyLarge2"]))
    if DASHBOARD.exists():
        with PILImage.open(DASHBOARD) as image:
            iw, ih = image.size
        scale = min(CONTENT_W / iw, 405 / ih)
        story.append(Image(str(DASHBOARD), width=iw * scale, height=ih * scale))
    else:
        story.append(Paragraph("Dashboard screenshot was not available at generation time.", STYLES["BodyLarge2"]))
    return story


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    SimpleDocTemplate(str(OUTPUT), pagesize=PAGE_SIZE, rightMargin=MARGIN, leftMargin=MARGIN, topMargin=34, bottomMargin=34).build(build_story(), onFirstPage=footer, onLaterPages=footer)
    print(OUTPUT)


if __name__ == "__main__":
    main()

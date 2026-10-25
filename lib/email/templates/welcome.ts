export interface WelcomeEmailProps {
  firstName: string;
  appUrl: string;
  unsubscribeUrl: string;
}

export function getWelcomeEmailHtml({ firstName, appUrl, unsubscribeUrl }: WelcomeEmailProps) {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>Welcome to Forge</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { border:0; height:auto; line-height:100%; outline:none; text-decoration:none; display:block; }
    body { margin:0; padding:0; width:100% !important; background-color:#000000; }
    a { text-decoration:none; }
    a[x-apple-data-detectors] { color:inherit !important; text-decoration:none !important; }
    @media only screen and (max-width:620px) {
      .shell { width:100% !important; }
      .pad { padding-left:24px !important; padding-right:24px !important; }
      .h1 { font-size:28px !important; line-height:1.2 !important; }
      .h2 { font-size:20px !important; }
      .stack { display:block !important; width:100% !important; padding-right:0 !important; padding-bottom:28px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#000000;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#000000;">
    Your workspace is live. Here is what to set up first so Forge writes like you and not like everyone else.
    &#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#000000" style="background-color:#000000;">
    <tr>
      <td align="center" style="padding:0;">
        <table role="presentation" class="shell" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
          <tr>
            <td class="pad" style="padding:40px 40px 32px 40px;">
              <span style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#d18a5e;">
                Forge
              </span>
            </td>
          </tr>
          <tr>
            <td style="padding:0;">
              <img src="${appUrl}/assets/email/workspace.jpg"
                   width="600" alt="The Forge workspace"
                   style="width:100%;max-width:600px;height:auto;display:block;border:0;" />
            </td>
          </tr>
          <tr>
            <td class="pad" style="padding:44px 40px 0 40px;">
              <h1 class="h1" style="margin:0 0 20px 0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:34px;line-height:1.18;font-weight:600;letter-spacing:-0.03em;color:#f5f5f5;">
                Hi, ${firstName}.
              </h1>
              <p style="margin:0 0 20px 0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.7;color:#a8a8a8;">
                Most content tools give you a blank box and a friendly tone. You still do the thinking, and the output still reads like it came from a machine that has never met you.
              </p>
              <p style="margin:0 0 20px 0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.7;color:#a8a8a8;">
                Forge works the other way around. It learns how you actually sound, remembers what you have already tried, and pushes back when an idea is weak. The more you use it, the less it sounds like a tool.
              </p>
            </td>
          </tr>
          <tr>
            <td class="pad" style="padding:36px 40px 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:1px;line-height:1px;font-size:0;background-color:#1c1c1c;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="pad" style="padding:36px 40px 0 40px;">
              <p style="margin:0 0 28px 0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#666666;">
                Worth doing first
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px;">
                <tr>
                  <td>
                    <h2 class="h2" style="margin:0 0 10px 0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:19px;line-height:1.3;font-weight:600;letter-spacing:-0.01em;color:#f0f0f0;">
                      Brand DNA
                    </h2>
                    <p style="margin:0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#8f8f8f;">
                      Drop in a brand deck, a tone guide, or three posts that performed well. Forge reads them once and then writes from them every time, so you stop re-explaining who you are at the start of every session.
                    </p>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px;">
                <tr>
                  <td>
                    <h2 class="h2" style="margin:0 0 10px 0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:19px;line-height:1.3;font-weight:600;letter-spacing:-0.01em;color:#f0f0f0;">
                      Tools that do one thing properly
                    </h2>
                    <p style="margin:0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#8f8f8f;">
                      The Hook Grader scores a first line before you publish it and tells you exactly why it will underperform. The Competitor Gap Analyzer finds the position nobody in your space is willing to take. The Ghostwriter Clone matches your cadence closely enough that your own readers will not notice the difference.
                    </p>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px;">
                <tr>
                  <td>
                    <h2 class="h2" style="margin:0 0 10px 0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:19px;line-height:1.3;font-weight:600;letter-spacing:-0.01em;color:#f0f0f0;">
                      A calendar that fills itself
                    </h2>
                    <p style="margin:0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#8f8f8f;">
                      Ask for a month of content and Forge schedules it, spaced so the same idea does not land twice in a week. Every entry stays editable. Nothing gets posted without you.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 0 0 0;">
              <!-- Note: Ensure this image is hosted publicly! -->
              <img src="https://raw.githubusercontent.com/Shv-tech/contentforged/main/PAY%20FOR%20WHAT%20ACTTUALLY%20WORKS2.png"
                   width="600" alt="AI, with continuity"
                   style="width:100%;max-width:600px;height:auto;display:block;border:0;" />
            </td>
          </tr>
          <tr>
            <td class="pad" style="padding:44px 40px 0 40px;">
              <h2 class="h2" style="margin:0 0 16px 0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:22px;line-height:1.3;font-weight:600;letter-spacing:-0.02em;color:#f5f5f5;">
                It remembers, so you stop repeating yourself
              </h2>
              <p style="margin:0 0 20px 0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.7;color:#a8a8a8;">
                Every other chat tool starts from nothing. You paste the same background, correct the same habits, and get the same generic draft back a slightly different way.
              </p>
              <p style="margin:0 0 20px 0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.7;color:#a8a8a8;">
                Forge carries your context between sessions. It knows the hook style your audience responds to, the angles you have already used, and the ones that did not land. Week six is meaningfully better than week one, which is not something you can say about a blank prompt box.
              </p>
            </td>
          </tr>
          <tr>
            <td class="pad" style="padding:36px 40px 0 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="#181818" style="border-radius:100px;border:1px solid #2e2e2e;">
                    <a href="${appUrl}/dashboard" target="_blank"
                       style="display:inline-block;padding:14px 30px;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:500;line-height:1;color:#f0f0f0;text-decoration:none;border-radius:100px;">
                      Open workspace &nbsp;&rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="pad" style="padding:36px 40px 0 40px;">
              <p style="margin:0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#8f8f8f;">
                If something is unclear or does not work the way you expected, reply to this email. It reaches a person, not a queue.
              </p>
            </td>
          </tr>
          <tr>
            <td class="pad" style="padding:48px 40px 56px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:1px;line-height:1px;font-size:0;background-color:#1c1c1c;">&nbsp;</td></tr>
              </table>
              <p style="margin:24px 0 6px 0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;line-height:1.7;color:#555555;">
                You are receiving this because you created a Forge account.
              </p>
              <p style="margin:0 0 6px 0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;line-height:1.7;color:#555555;">
                SHV Groups Pvt Ltd, New Delhi, India
              </p>
              <p style="margin:0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;line-height:1.7;">
                <a href="${unsubscribeUrl}" style="color:#555555;text-decoration:underline;">Unsubscribe</a>
                <span style="color:#3a3a3a;">&nbsp;&middot;&nbsp;</span>
                <a href="${unsubscribeUrl}&manage=1" style="color:#555555;text-decoration:underline;">Email preferences</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
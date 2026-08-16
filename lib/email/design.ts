/**
 * lib/email/design.ts
 *
 * A small design system for email HTML.
 *
 * WHY PRIMITIVES INSTEAD OF ONE BIG TEMPLATE STRING
 *
 * Email HTML is hostile: Outlook renders through Word, Gmail strips <style>
 * blocks in some clients, flexbox and grid are unreliable, and every rule has
 * to be inlined. Writing each new email by hand means re-deriving those
 * workarounds every time and getting them subtly wrong.
 *
 * These are composable pieces with the constraints already solved, so a new
 * email is assembled from known-good parts rather than authored from scratch.
 *
 * THE VISUAL DIRECTION
 *
 * Restrained and typographic, in the register Stripe, Linear and Anthropic
 * use. What makes those emails feel expensive is not decoration: it is
 * generous whitespace, one accent colour used sparingly, a strict type scale,
 * and the discipline to leave things out. Gradients, drop shadows, stock
 * imagery and multiple accent colours all read as cheaper, not richer.
 */

// ============================================================================
// TOKENS
// ============================================================================

export const email = {
  color: {
    // Copper, carried over from the product UI so email and app feel like the
    // same company. Used for one element per email at most.
    accent: '#bf671d',
    accentSoft: '#fdf3ec',

    ink: '#0f0f0f',
    body: '#3f3f46',
    muted: '#71717a',
    faint: '#a1a1aa',

    surface: '#ffffff',
    canvas: '#f4f4f5',
    hairline: '#e4e4e7',

    // Dark mode. Applied via prefers-color-scheme, which Apple Mail and
    // recent Outlook honour. Gmail does not, so the light palette must stand
    // on its own and the dark palette is an enhancement, never a requirement.
    darkCanvas: '#09090b',
    darkSurface: '#141416',
    darkHairline: '#27272a',
    darkInk: '#fafafa',
    darkBody: '#a1a1aa',
  },

  font: {
    // System stack. Webfonts in email are unreliable and cost a render-blocking
    // request; the system stack is what the recipient's OS already renders
    // best.
    sans: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`,
    mono: `ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace`,
  },

  // Deliberately coarse. A tight scale with few steps produces more coherent
  // layouts than one with a value for every occasion.
  size: {
    display: '30px',
    title: '22px',
    body: '15px',
    small: '13px',
    caption: '11px',
  },

  space: {
    xs: '8px',
    sm: '14px',
    md: '24px',
    lg: '36px',
    xl: '48px',
  },

  width: '560px',
} as const;

/**
 * Escapes text destined for HTML.
 *
 * Any user-supplied value (a name, a workspace title, a plan label) must pass
 * through this. An unescaped apostrophe breaks the markup; an unescaped angle
 * bracket is an injection vector into an email you are about to send to
 * thousands of people.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================================================
// PRIMITIVES
// ============================================================================

export function heading(text: string, level: 'display' | 'title' = 'title'): string {
  const size = level === 'display' ? email.size.display : email.size.title;
  const weight = level === 'display' ? 600 : 600;
  const spacing = level === 'display' ? '-0.02em' : '-0.01em';

  return `
    <h1 class="ink" style="margin:0 0 ${email.space.sm} 0;font-family:${email.font.sans};font-size:${size};line-height:1.25;font-weight:${weight};letter-spacing:${spacing};color:${email.color.ink};">
      ${text}
    </h1>`;
}

export function paragraph(html: string, options: { muted?: boolean } = {}): string {
  const color = options.muted ? email.color.muted : email.color.body;
  const cls = options.muted ? 'muted' : 'body';

  return `
    <p class="${cls}" style="margin:0 0 ${email.space.md} 0;font-family:${email.font.sans};font-size:${email.size.body};line-height:1.65;color:${color};">
      ${html}
    </p>`;
}

/**
 * Primary call to action.
 *
 * Built as a table rather than a styled anchor because Outlook ignores padding
 * on inline elements, which collapses a padded <a> into unclickable text.
 */
export function button(label: string, href: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 ${email.space.md} 0;">
      <tr>
        <td align="center" bgcolor="${email.color.ink}" style="border-radius:8px;">
          <a href="${href}" target="_blank"
             style="display:inline-block;padding:13px 26px;font-family:${email.font.sans};font-size:14px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:8px;">
            ${label}
          </a>
        </td>
      </tr>
    </table>`;
}

/** Lower-emphasis link for a secondary action. */
export function textLink(label: string, href: string): string {
  return `<a href="${href}" target="_blank" style="color:${email.color.accent};text-decoration:underline;font-weight:500;">${label}</a>`;
}

/** Quiet horizontal rule. Built from a table so Outlook renders it. */
export function divider(): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:${email.space.md} 0;">
      <tr><td class="hairline" style="height:1px;line-height:1px;font-size:0;background-color:${email.color.hairline};">&nbsp;</td></tr>
    </table>`;
}

/** Callout for a single fact worth isolating: a figure, a date, a limit. */
export function highlight(label: string, value: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 ${email.space.md} 0;">
      <tr>
        <td class="soft" style="padding:${email.space.sm} ${email.space.md};background-color:${email.color.accentSoft};border-radius:10px;">
          <div style="font-family:${email.font.sans};font-size:${email.size.caption};font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${email.color.accent};margin-bottom:4px;">
            ${label}
          </div>
          <div class="ink" style="font-family:${email.font.sans};font-size:${email.size.body};font-weight:600;color:${email.color.ink};">
            ${value}
          </div>
        </td>
      </tr>
    </table>`;
}

/**
 * Bulleted list.
 *
 * Uses explicit table rows rather than <ul>, because list indentation and
 * marker rendering differ enough across clients to break alignment.
 */
export function bullets(items: string[]): string {
  const rows = items
    .map(
      (item) => `
      <tr>
        <td valign="top" style="padding:0 10px ${email.space.xs} 0;font-family:${email.font.sans};font-size:${email.size.body};line-height:1.65;color:${email.color.accent};">&bull;</td>
        <td valign="top" class="body" style="padding:0 0 ${email.space.xs} 0;font-family:${email.font.sans};font-size:${email.size.body};line-height:1.65;color:${email.color.body};">${item}</td>
      </tr>`
    )
    .join('');

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 ${email.space.md} 0;">
      ${rows}
    </table>`;
}

// ============================================================================
// SHELL
// ============================================================================

export interface EmailShellOptions {
  /** Shown in the inbox list under the subject. Never rendered in the body. */
  preheader: string;
  body: string;
  /** Omitted for transactional email, which has no unsubscribe. */
  unsubscribeUrl?: string;
  /** Describes what this email is, so the footer can be specific. */
  footerReason?: string;
}

/**
 * Wraps body content in the full document.
 *
 * The preheader is the short text clients show beside the subject line. Left
 * unset, they scrape the first words of the body, which usually surfaces
 * "View in browser" or a stray link. It is hidden with a combination of rules
 * because no single technique works across all clients.
 */
export function renderEmail(options: EmailShellOptions): string {
  const { preheader, body, unsubscribeUrl, footerReason } = options;

  const footer = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:${email.space.lg};">
      <tr>
        <td style="padding-top:${email.space.md};border-top:1px solid ${email.color.hairline};">
          <p class="faint" style="margin:0 0 6px 0;font-family:${email.font.sans};font-size:${email.size.caption};line-height:1.6;color:${email.color.faint};">
            ${footerReason ?? 'You are receiving this because you have a Forge account.'}
          </p>
          <p class="faint" style="margin:0 0 6px 0;font-family:${email.font.sans};font-size:${email.size.caption};line-height:1.6;color:${email.color.faint};">
            SHV Groups Pvt Ltd &middot; New Delhi, India
          </p>
          ${
            unsubscribeUrl
              ? `<p style="margin:0;font-family:${email.font.sans};font-size:${email.size.caption};line-height:1.6;">
                   <a href="${unsubscribeUrl}" style="color:${email.color.faint};text-decoration:underline;">Unsubscribe</a>
                   <span style="color:${email.color.faint};"> &middot; </span>
                   <a href="${unsubscribeUrl}&manage=1" style="color:${email.color.faint};text-decoration:underline;">Manage preferences</a>
                 </p>`
              : ''
          }
        </td>
      </tr>
    </table>`;

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title></title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { border:0; height:auto; line-height:100%; outline:none; text-decoration:none; }
    body { margin:0; padding:0; width:100% !important; }
    a { text-decoration:none; }

    @media only screen and (max-width:600px) {
      .shell { width:100% !important; }
      .pad { padding-left:24px !important; padding-right:24px !important; }
    }

    /* Enhancement only. Gmail ignores this, so the light palette above must
       already be correct on its own. */
    @media (prefers-color-scheme: dark) {
      .canvas { background-color:${email.color.darkCanvas} !important; }
      .surface { background-color:${email.color.darkSurface} !important; }
      .ink { color:${email.color.darkInk} !important; }
      .body { color:${email.color.darkBody} !important; }
      .muted, .faint { color:#8b8b93 !important; }
      .hairline { background-color:${email.color.darkHairline} !important; }
      .soft { background-color:#1e1a17 !important; }
    }
  </style>
</head>
<body class="canvas" style="margin:0;padding:0;background-color:${email.color.canvas};">

  <!-- Preheader. Hidden in the body, shown in the inbox preview. The trailing
       entities push client-scraped body text out of the preview window. -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${email.color.canvas};">
    ${preheader}
    ${'&#847;&zwnj;&nbsp;'.repeat(60)}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="canvas" style="background-color:${email.color.canvas};">
    <tr>
      <td align="center" style="padding:${email.space.xl} 16px;">

        <table role="presentation" class="shell" width="${email.width}" cellpadding="0" cellspacing="0" border="0" style="width:${email.width};max-width:${email.width};">

          <tr>
            <td class="pad" style="padding:0 ${email.space.lg} ${email.space.md} ${email.space.lg};">
              <span style="font-family:${email.font.sans};font-size:${email.size.caption};font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${email.color.accent};">
                Forge
              </span>
            </td>
          </tr>

          <tr>
            <td class="surface" style="background-color:${email.color.surface};border-radius:16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="pad" style="padding:${email.space.lg};">
                    ${body}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="pad" style="padding:0 ${email.space.lg};">
              ${footer}
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;
}
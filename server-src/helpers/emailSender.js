const Mailgun = require("mailgun.js");
const formData = require("form-data");
const handlebars = require("handlebars");
const fs = require("fs/promises");
const path = require("path");

const mailgun = new Mailgun(formData);

const client = mailgun.client({
  username: "api",
  key: process.env.MAILGUN_API_KEY,
});

/*
|--------------------------------------------------------------------------
| Register handlebars helpers
|--------------------------------------------------------------------------
*/

handlebars.registerHelper("uppercase", (text) => text?.toUpperCase() || "");

handlebars.registerHelper("year", () => new Date().getFullYear());

/*
|--------------------------------------------------------------------------
| Email template registry
|--------------------------------------------------------------------------
|
| Add templates here once.
| Missing files fail during startup.
|
*/

const templateRegistry = {
  test: "../emails/test.html",
  orderConfirmation: "../emails/order-confirmation.html",
  // resetPassword: "../emails/reset-password.html",
};

/*
|--------------------------------------------------------------------------
| Compiled template cache
|--------------------------------------------------------------------------
*/

const compiledTemplates = {};

/*
|--------------------------------------------------------------------------
| Load + compile templates
|--------------------------------------------------------------------------
*/

const loadTemplates = async () => {
  for (const [name, file] of Object.entries(templateRegistry)) {
    const filePath = path.join(__dirname, file);

    const source = await fs.readFile(filePath, "utf8");

    compiledTemplates[name] = handlebars.compile(source);
  }

  console.log("✓ Email templates loaded");
};

/*
|--------------------------------------------------------------------------
| Send raw HTML email
|--------------------------------------------------------------------------
*/

const sendEmail = async ({ to, subject, html }) => {
  return client.messages.create(process.env.MAILGUN_DOMAIN, {
    from: process.env.EMAIL_FROM,
    to,
    subject,
    html,
    "h:Reply-To": "support.housemaduekwe@gmail.com",
  });
};

/*
|--------------------------------------------------------------------------
| Render template
|--------------------------------------------------------------------------
*/

const renderTemplate = (templateName, variables = {}) => {
  const template = compiledTemplates[templateName];

  if (!template) {
    console.error(
      `Unknown template:
       ${templateName}`,
    );

    return null;
  }

  return template(variables);
};

/*
|--------------------------------------------------------------------------
| Send templated email
|--------------------------------------------------------------------------
*/

const sendTemplatedEmail = async ({ to, subject, template, variables }) => {
  const html = renderTemplate(template, variables);

  if (!html) return;

  return sendEmail({
    to,
    subject,
    html,
  });
};

module.exports = {
  loadTemplates,
  sendEmail,
  renderTemplate,
  sendTemplatedEmail,
};

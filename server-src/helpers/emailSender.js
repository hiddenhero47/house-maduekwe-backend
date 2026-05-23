const Mailgun = require("mailgun.js");
const formData = require("form-data");

const mailgun = new Mailgun(formData);

const client = mailgun.client({
  username: "api",
  key: process.env.MAILGUN_API_KEY,
});

const sendEmail = async ({ to, subject, html }) => {
  await client.messages.create(process.env.MAILGUN_DOMAIN, {
    from: process.env.EMAIL_FROM,
    to,
    subject,
    html,
  });
};

module.exports = sendEmail;

// await sendEmail({
//    to: user.email,
//    subject: "Order confirmed",
//    html: "<h2>Payment successful</h2>"
// });

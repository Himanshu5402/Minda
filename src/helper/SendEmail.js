import { fileURLToPath } from "url";
import path from "path";
import ejs from "ejs";

// -------------------------- local import -----------------------
import { transport } from "../config/MailTransporter.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

// recreate __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const SendMail = async (templateName, templateData, ReceiverInfo) => {
  try {
    const templatePath = path.join(__dirname,"../templates",`${templateName}.ejs`);

    // Render EJS template
    const html = await ejs.renderFile(templatePath, templateData);

    // Send mail (Gmail requires "from" to be the authenticated email)
    const fromEmail = config.EMAIL_AUTH || "noreply@email.com";
    await transport.sendMail({
      from: fromEmail,
      to: ReceiverInfo.email,
      subject: ReceiverInfo.subject,
      html,
    });

    logger.info("Email sent successfully to", ReceiverInfo.email);
  } catch (error) {
    logger.error("SendMail error:", error);
    throw error;
  }
};

/**
 * Sends "template for approval" notification to a single recipient.
 * @param {string} recipientEmail
 * @param {string} recipientName
 * @param {string} templateName
 * @param {string} [submittedByName] - Name of user who submitted (optional)
 */
export const sendTemplateApprovalNotification = async (
  recipientEmail,
  recipientName,
  templateName,
  submittedByName = ""
) => {
  if (!recipientEmail || !templateName) return;
  await SendMail(
    "templateApprovalNotification",
    {
      recipientName: recipientName || "User",
      templateName,
      submittedByName: submittedByName || "",
    },
    {
      email: recipientEmail,
      subject: `Template Approval Required: ${templateName}`,
    }
  );
};

// Final decision notifications
export const sendTemplateApprovedNotification = async (
  recipientEmail,
  recipientName,
  templateName
)=> {
  if (!recipientEmail || !templateName) return;
  await SendMail(
    "templateApproved",
    {
      recipientName: recipientName || "User",
      templateName,
    },
    {
      email: recipientEmail,
      subject: `Template Approved: ${templateName}`,
    }
  );
};

export const sendTemplateRejectedNotification = async (
  recipientEmail,
  recipientName,
  templateName
)=> {
  if (!recipientEmail || !templateName) return;
  await SendMail(
    "templateRejected",
    {
      recipientName: recipientName || "User",
      templateName,
    },
    {
      email: recipientEmail,
      subject: `Template Rejected: ${templateName}`,
    }
  );
};

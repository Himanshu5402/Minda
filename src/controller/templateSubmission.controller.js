import { StatusCodes } from "http-status-codes";
import { AsyncHandler } from "../utils/asyncHandler.js";
import {
  createTemplateSubmissionService,
  updateTemplateSubmissionService,
  getTemplateSubmissionService,
  getUserTemplateSubmissionsService,
  getLatestUserSubmissionForTemplateService,
  submitTemplateSubmissionService,
  getTemplateSubmitionDataService,
} from "../services/templateSubmission.service.js";
import { getTemplateWorkflowStatusService, updateAssignedUserStatusService } from "../services/templateMaster.service.js";
import { GetAdmin, GetUsersByIdService } from "../services/users.service.js";
import { sendTemplateApprovalNotification } from "../helper/SendEmail.js";
import { CreateTemplateApprovalNotification, singleNotification } from "../services/notification.service.js";
import { sendNewNotification } from "../socket/notification.socket.js";
import { logger } from "../utils/logger.js";

export const createTemplateSubmission = AsyncHandler(async (req, res) => {
  const userId = req.currentUser._id;
  const { template_id, form_data, status,user_id,plant_id } = req.body;

  const result = await createTemplateSubmissionService({
    template_id,
    user_id,
    form_data,
    status,
    plant_id
  });

  res.status(StatusCodes.CREATED).json({
    message: "Template submission saved successfully",
    data: result,
  });

   await updateAssignedUserStatusService(template_id, { user_id:userId, status: "in-progress"});


});

export const updateTemplateSubmission = AsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { form_data, status, edit_count } = req.body;

  const result = await updateTemplateSubmissionService(id, {
    form_data,
    status,
    edit_count
  });

  return res.status(StatusCodes.OK).json({
    message: "Template submission updated successfully",
    data: result,
  });
});

export const getTemplateSubmission = AsyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await getTemplateSubmissionService(id);

  return res.status(StatusCodes.OK).json({
    message: "Template submission fetched successfully",
    data: result,
  });
});

export const getUserTemplateSubmissions = AsyncHandler(async (req, res) => {
  const userId = req.currentUser._id;
  const { template_id,plant_id } = req.query;

  const result = await getUserTemplateSubmissionsService(userId, template_id || null, plant_id || null)

  return res.status(StatusCodes.OK).json({
    message: "Template submissions fetched successfully",
    data: result,
  });
});

export const getLatestUserSubmissionForTemplate = AsyncHandler(async (req, res) => {
  const userId = req.currentUser._id;
  const { template_id } = req.params;

  const result = await getLatestUserSubmissionForTemplateService(userId, template_id);

  return res.status(StatusCodes.OK).json({
    message: "Latest template submission fetched successfully",
    data: result,
  });
});

export const submitTemplateSubmission = AsyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await submitTemplateSubmissionService(id);

  // Notify first approver + admin when template is submitted for approval
  try {
    const templateId = result.template_id ?? result.get?.("template_id");
    const userId = result.user_id ?? result.get?.("user_id");
    if (!templateId || !userId) {
      logger.warn("Submit notification skipped: missing template_id or user_id on submission");
      return res.status(StatusCodes.OK).json({
        message: "Template submitted successfully",
        data: result,
      });
    }

    const workflowStatus = await getTemplateWorkflowStatusService(templateId, userId);
    const chain = workflowStatus?.chain || [];
    const templateName = workflowStatus?.template_name || "Template";
    const submitter = await GetUsersByIdService(userId);
    const submittedByName = submitter?.full_name || "";
    const admin = await GetAdmin();

    const notifyRecipient = async (recipientId, recipientEmail, recipientName) => {
      if (!recipientId) return;
      await sendTemplateApprovalNotification(recipientEmail, recipientName, templateName, submittedByName);
      try {
        const notif = await CreateTemplateApprovalNotification({
          reciverId: recipientId,
          senderId: userId,
          templateName,
          templateId,
          submittedByName,
        });
        const full = await singleNotification(notif._id);
        if (full) sendNewNotification(full);
      } catch (e) {
        logger.error("CreateTemplateApprovalNotification error:", e);
      }
    };

    // Admin
    if (admin?._id) {
      await notifyRecipient(admin._id, admin.email, admin.full_name);
    } else {
      logger.warn("Submit notification: no admin user found");
    }

    // HOD
    const hodId = submitter?.hod_id ?? submitter?.get?.("hod_id");
    if (hodId) {
      const hodUser = await GetUsersByIdService(hodId);
      if (hodUser?._id && hodUser?.email) {
        await notifyRecipient(hodUser._id, hodUser.email, hodUser.full_name);
      }
    }

    // First approver (if different from HOD)
    if (chain.length > 0) {
      const firstApproverUserId = chain[0].user_id;
      const isSameAsHod = hodId && String(firstApproverUserId) === String(hodId);
      if (!isSameAsHod) {
        const firstApprover = firstApproverUserId ? await GetUsersByIdService(firstApproverUserId) : null;
        if (firstApprover?._id && firstApprover?.email) {
          await notifyRecipient(firstApprover._id, firstApprover.email, firstApprover.full_name);
        }
      }
    }
  } catch (err) {
    logger.error("Submit approval notification email error:", err);
  }

  return res.status(StatusCodes.OK).json({
    message: "Template submitted successfully",
    data: result,
  });
});

export const getTemplateSubmitionData = AsyncHandler(async (req, res) => {
  let { limit,page } = req.query;
  const user = req.currentUser;
  limit = parseInt(limit) || 10;
  page = parseInt(page) || 1;
  const skip = (page - 1) * limit; 
  const result = await getTemplateSubmitionDataService(user.is_admin,user._id,limit, skip);

  return res.status(StatusCodes.OK).json({
    message: "Template submission data fetched successfully",
    data: result,
  });
});

import { UserModel } from "../models/user.modal.js";
import { CompanyModel } from "../models/company.modal.js";
import { PlantModel } from "../models/plant.modal.js";
import { RoleModel } from "../models/role.modal.js";
import Sequelize, { Op } from "sequelize";
import { DepartmentModel } from "../models/department.modal.js";
import { TemplateMasterModel } from "../models/templateMaster.model.js";
import { WorkflowModel } from "../models/workflow.modal.js";
import { GroupUsersModel } from "../models/groupUsers.model.js";
import { TemplateFieldModel } from "../models/templateField.model.js";
import { TemplateSubmissionModel } from "../models/templateSubmission.model.js";
import { WorkflowApprovalModel } from "../models/workflowApproval.model.js";
import { getCurrentApproverForTemplateAssignee } from "./templateMaster.service.js";



export const createUserService = async (data) => {
    const result = await UserModel.create(data);
    return result;

};

export const GetUsersService = async (skip, limit) => {
    const result = await UserModel.findAll({
        where: { is_admin: false },
        include: [
            { model: RoleModel, as: "userRole" },
            { model: CompanyModel, as: "company" },
            { model: PlantModel, as: "plant" },
            { model: DepartmentModel, as: "department" },
        ],
        offset: skip,
        limit,
        order: [["createdAt", "ASC"]],
    });
    return result;
};

export const GetAllUsersService = async () => {
    const result = await UserModel.findAll({
        where: { is_admin: false },
        attributes: ["_id", "email", "user_id", "full_name"],
        order: [["createdAt", "ASC"]],
    });
    return result;
};

export const SearchUsersService = async (is_hod, company, plant, search = "", skip, limit) => {
    const q = search || "";
    const where = {
        is_admin: false,
        [Op.or]: [{ email: { [Op.like]: `%${q}%` } }, { user_id: { [Op.like]: `%${q}%` } }],
        ...(is_hod ? { is_hod } : {}),
        ...(company ? { employee_company: company } : {}),
        ...(plant ? { employee_plant: plant } : {}),
    }

    const result = await UserModel.findAll({
        where,
        include: [
            { model: RoleModel, as: "userRole" },
            { model: CompanyModel, as: "company" },
            { model: PlantModel, as: "plant" },
            { model: DepartmentModel, as: "department" },
        ],
        offset: skip,
        limit,
        order: [["createdAt", "ASC"]],
    });
    return result;
};

export const UpdateUsersService = async (id, data) => {
    const user = await UserModel.findByPk(id);
    if (!user) return null;
    const result = await user.update(data);
    return result;
};

export const DeleteUsersService = async (id) => {
    const user = await UserModel.findByPk(id);
    if (!user) return null;
    await user.destroy();
    const result = user;
    return result;
};

export const FindUserByEmailOrUserId = async (email) => {
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

    const result = await UserModel.findOne({
        where: {
            [Op.or]: [
                { email: normalizedEmail },
                Sequelize.where(
                    Sequelize.fn("LOWER", Sequelize.col("email")),
                    normalizedEmail
                ),
                { user_id: email },
            ],
        },
    });
    return result;
};


export const FindUserById = async (id) => {
    const result = await UserModel.findByPk(id, {
        attributes: [
            "_id",
            "full_name",
            "email",
            "desigination",
            "user_id",
            "employee_plant",
            "employee_company",
            "role",
            "is_admin",
            "terminate",
            "is_hod",
            "hod_id",
        ],
        include: [
            { model: PlantModel, as: "plant" },
            { model: CompanyModel, as: "company" },
            { model: RoleModel, as: "userRole" },
            // { model: RoleModel, as: "department" },
        ],
    });
    return result;
};

export const FindUserByEmail = async (email) => {
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

    const result = await UserModel.findOne({
        where: {
            [Op.or]: [
                { email: normalizedEmail },
                Sequelize.where(
                    Sequelize.fn("LOWER", Sequelize.col("email")),
                    normalizedEmail
                ),
            ],
        },
    });
    return result;
};


export const GetAdmin = async () => {
    const result = await UserModel.findOne({ where: { is_admin: true } });
    return result;
};


export const GetUsersByIdService = async (id) => {
    const result = await UserModel.findOne({
        where: {
            _id: id
        },
        attributes: [
            "_id",
            "full_name",
            "email",
            "desigination",
            "user_id",
            "hod_id",
        ]
    });
    return result;
};

export const getAllHodsServicesData = async () => {
    const result = await UserModel.findAll({
        attributes: ["_id", "full_name", "email", "user_id"],
        where: {
            is_hod: true
        }
    });
    return result;
};

export const getAllUsersUnderHod = async (id) => {
    const result = await UserModel.findAll({
        where: {
            hod_id: id
        },
        attributes: ["_id"]
    });
    return result.map((item) => item._id)
};

export const getAllReleseGroupUsers = async () => {
    const result = await UserModel.findAll({
        where: {
            is_hod: false,
            hod_id: null,
            is_admin: false
        },
        attributes: ["_id", "user_id", "email", "full_name"]
    });
    return result;

};

export const getEmployeesOnlyHaveHod = async () => {
    const result = await UserModel.findAll({
        where: {
            is_admin: false,
            is_hod: false,
            hod_id: { [Op.not]: null }
        },
        attributes: ["_id", "user_id", "email", "full_name", "is_hod", "hod_id"]
    });
    return result;
};

export const GetTemplateAssignModuleServiceByUser = async (filterUserId) => {
    // Get the filter user details first
    const filterUser = await UserModel.findOne({
        where: { _id: filterUserId },
        raw: true
    });

    // Fetch HOD and Approval type fields separately (for workflow fields)
    const templateField = await TemplateFieldModel.findAll({
        where: {
            type: { [Op.in]: ['HOD', 'Approval'] }
        }
    });

    if (!filterUser) {
        throw new Error('Filter user not found');
    }

    // Get all non-admin users with HOD
    const allUsers = await UserModel.findAll({
        where: {
            is_admin: false,
            hod_id: { [Op.not]: null }
        },
        raw: true
    });

    // Get all active templates
    const templates = await TemplateMasterModel.findAll({
        where: {
            is_active: true
        },
        raw: false
    });

    // Get all template IDs
    const templateIds = templates.map(t => t._id);

    // Get all user IDs
    const userIds = allUsers.map(u => u._id);

    // Fetch ALL template fields for field_id to field_name mapping (including normal fields)
    const allTemplateFields = await TemplateFieldModel.findAll({
        where: {
            template_id: { [Op.in]: templateIds }
        },
        raw: true
    });

    // Create a map of field_id to field_name for form_data conversion
    const fieldIdToNameMap = new Map();
    allTemplateFields.forEach(field => {
        fieldIdToNameMap.set(field._id, field.field_name);
    });

    // Fetch only SUBMITTED template submissions
    const templateSubmissions = await TemplateSubmissionModel.findAll({
        where: {
            template_id: { [Op.in]: templateIds },
            user_id: { [Op.in]: userIds },
            status: "SUBMITTED",
            process_approved:false
        },
        include:[{model:PlantModel,as:"plant",attributes:["_id","plant_name","plant_code"]}],
        raw: false
    });

    // Create a map: user_id -> array of submissions
    const userSubmissionsMap = new Map();
    templateSubmissions.forEach(submission => {

        if (!userSubmissionsMap.has(submission.user_id)) {
            userSubmissionsMap.set(submission.user_id, []);
        }

        // Convert form_data from field_id to field_name
        const originalFormData = submission.form_data || {};
        const convertedFormData = {};

        Object.keys(originalFormData).forEach((formKey, index) => {
            let fieldName = fieldIdToNameMap.get(formKey);
            let displayKey = formKey;
            // Handle dynamic field keys: fieldId_index (e.g. C2F5B84A..._0)
            if (!fieldName && formKey.includes('_')) {
                const lastUnderscore = formKey.lastIndexOf('_');
                const suffix = formKey.slice(lastUnderscore + 1);
                if (/^\d+$/.test(suffix)) {
                    const baseFieldId = formKey.slice(0, lastUnderscore);
                    fieldName = fieldIdToNameMap.get(baseFieldId);
                    if (fieldName) displayKey = fieldName + "~" + index;
                }
            } else if (fieldName) {
                displayKey = fieldName + "~" + index;
            }
            convertedFormData[displayKey] = originalFormData[formKey];
        });

        userSubmissionsMap.get(submission.user_id).push({
            submission_id: submission._id,
            edit_count: submission.edit_count,
            template_id: submission.template_id,
            plant_id: submission.plant_id,
            plant_detail: submission.plant,
            status: submission.status,
            form_data: convertedFormData,
            submitted_at: submission.createdAt,
            updated_at: submission.updatedAt,
            prev: submission.form_data
        });
    });


    // Get all unique workflow IDs from templates
    const workflowIds = [...new Set(
        templates
            .map(t => t.workflow_id)
            .filter(Boolean)
    )];

    // Fetch all workflow approvals
    const workflowApprovals = await WorkflowApprovalModel.findAll({
        where: {
            template_id: { [Op.in]: templateIds },
            user_id: { [Op.in]: userIds }
        },
        order: [['current_stage', 'ASC']],
        raw: true
    });

    // Create a map: template_id + user_id + plant_id -> approvals array
    const approvalsMap = new Map();
    const rejectedKeys = new Set();
    
    workflowApprovals.forEach(approval => {
        const plantId = approval.submission_id || 'default';
        const key = `${approval.template_id}_${approval.user_id}_${plantId}_${approval.edit_count}`;
        
        if (!approvalsMap.has(key)) {
            approvalsMap.set(key, []);
        }
        
        approvalsMap.get(key).push({
            approval_id: approval._id,
            current_stage: approval.current_stage,
            reassign_stage: approval.reassign_stage,
            reassign_user_id: approval.reassign_user_id,
            reassign_status: approval.reassign_status,
            workflow_id: approval.workflow_id,
            status: approval.status,
            remarks: approval.remarks,
            approved_by: approval.approved_by,
            approved_at: approval.createdAt,
            updated_at: approval.updatedAt,
        });
        
        const isRejected = (approval.status || "").toLowerCase() === "reject" || approval.status === "rejected";
        if (isRejected) {
            rejectedKeys.add(key);
        }
    });

    // Fetch all workflows
    const workflows = await WorkflowModel.findAll({
        where: {
            _id: { [Op.in]: workflowIds }
        },
        raw: false
    });

    // Extract release group IDs
    const releaseGroupIds = new Set();
    workflows.forEach(workflow => {
        const workflowSteps = workflow.workflow || [];
        workflowSteps.forEach(step => {
            if (step.group && step.group !== "HOD" && step.group.trim() !== "") {
                releaseGroupIds.add(step.group);
            }
        });
    });

    // Fetch group users
    const groupUsers = await GroupUsersModel.findAll({
        where: {
            relese_group_id: { [Op.in]: Array.from(releaseGroupIds) }
        },
        order: [['createdAt', 'ASC']],
        raw: true
    });

    // Map: release_group_id -> group users
    const groupUsersMap = new Map();
    groupUsers.forEach(gu => {
        if (!groupUsersMap.has(gu.relese_group_id)) {
            groupUsersMap.set(gu.relese_group_id, []);
        }
        groupUsersMap.get(gu.relese_group_id).push(gu);
    });

    // Process workflows and attach group users data
    const workflowMap = new Map(
        workflows.map(w => {
            const workflowSteps = (w.workflow || []).map(step => {
                if (step.group && step.group !== "HOD" && step.group.trim() !== "") {
                    const groupUsersList = groupUsersMap.get(step.group) || [];

                    const allGroupUsers = groupUsersList.map(gu => ({
                        user_id: gu.user_id,
                        plants_id: gu.plants_id
                    }));

                    return {
                        group: step.group,
                        group_users: allGroupUsers
                    };
                } else if (step.group === "HOD") {
                    return {
                        group: "HOD",
                        group_users: []
                    };
                }

                return {
                    group: step.group || "",
                    group_users: []
                };
            });

            return [
                w._id,
                {
                    workflow_id: w._id,
                    workflow_name: w.name,
                    workflow: workflowSteps
                }
            ];
        })
    );

    // Get approval user names
    const approvalUserIds = new Set();
    workflowApprovals.forEach(a => {
        if (a.approved_by) approvalUserIds.add(a.approved_by);
        if (a.reassign_user_id) approvalUserIds.add(a.reassign_user_id);
    });
    
    const approvalUsersList = approvalUserIds.size > 0
        ? await UserModel.findAll({
            where: { _id: [...approvalUserIds] },
            attributes: ["_id", "full_name"],
            raw: true
        })
        : [];
    const approvalUserMap = new Map(approvalUsersList.map(u => [String(u._id), u.full_name || ""]));

    // Create template map for quick lookup
    const templateMap = new Map(templates.map(t => [t._id, t]));

    // Function to check if user should be included
    const shouldIncludeUser = (user) => {
        // STEP 1: Check if filterUserId is the HOD of this user
        if (user.hod_id === filterUserId) {
            return true;
        }

        // STEP 2: Check in workflow groups
        const userTemplates = templates.filter(template => {
            const assignedUsers = template.assigned_users;
            return assignedUsers.some(au => (au.user_id || au._id) === user._id);
        });

        for (const template of userTemplates) {
            const workflow = template.workflow_id ? workflowMap.get(template.workflow_id) : null;
            if (!workflow) continue;

            const workflowSteps = workflow.workflow || [];

            for (const step of workflowSteps) {
                if (step.group === "HOD") continue;
                if (!step.group_users || step.group_users.length === 0) continue;

                for (const groupUser of step.group_users) {
                    try {
                        const plantsArray = JSON.parse(groupUser.plants_id);
                        const plantMatches = plantsArray.includes(user.employee_plant);
                        const userIdMatches = groupUser.user_id === filterUserId;

                        if (plantMatches && userIdMatches) {
                            return true;
                        }
                    } catch (error) {
                        continue;
                    }
                }
            }
        }

        return false;
    };

    // Filter users
    const filteredUsers = allUsers.filter(user => shouldIncludeUser(user));

    // Helper function to filter group_users for a specific submission plant_id
    const filterGroupUsersForPlant = (workflowSteps, submissionPlantId, templateId) => {
        if (!workflowSteps || workflowSteps.length === 0) return workflowSteps;

        return workflowSteps.map((step, index) => {
            let fields = [];
            
            // HOD step - no filtering needed, return as is
            if (index === 0 || step.group === "HOD") {
                fields = templateField.filter(tf => tf.template_id === templateId && tf.type === "HOD");
                return {
                    ...step,
                    fields
                };
            }

            // For approval steps (index > 0), filter based on submission's plant_id
            if (!step.group_users || step.group_users.length === 0) {
                fields = templateField.filter(tf => 
                    tf.template_id === templateId && 
                    tf.type === "Approval" && 
                    tf.group_id === step.group
                );
                return {
                    ...step,
                    fields
                };
            }

            // Find group_user whose plants_id array contains the submission's plant_id
            const matchingGroupUser = step.group_users.find(gu => {
                try {
                    const plantsArray = JSON.parse(gu.plants_id);
                    // Check if submission's plant_id is in this group_user's plants
                    return plantsArray.includes(submissionPlantId);
                } catch (error) {
                    return false;
                }
            });

            // Get fields for this approval group
            fields = templateField.filter(tf => 
                tf.template_id === templateId && 
                tf.type === "Approval" && 
                tf.group_id === step.group
            );

            return {
                ...step,
                group_users: matchingGroupUser ? [matchingGroupUser] : [],
                fields
            };
        });
    };

    // Build result structure: User -> Submissions -> Template details
    const result = await Promise.all(filteredUsers.map(async (user) => {
        const userSubmissions = userSubmissionsMap.get(user._id) || [];
        
        if (userSubmissions.length === 0) {
            return null;
        }

        // Get all reassign users needed
        const allAllowedReassignIds = new Set();
        const submissionApproverMap = new Map();

        // Process each submission
        for (const submission of userSubmissions) {
            const template = templateMap.get(submission.template_id);
            if (!template) continue;

            const plantId = submission.plant_id || 'default';
            const rejectionKey = `${submission.template_id}_${user._id}_${plantId}`;
            
            if (rejectedKeys.has(rejectionKey)) continue;

            // Check if user is assigned to this template
            const assignedUsers = template.assigned_users || [];
            const isAssigned = assignedUsers.some(au => (au.user_id || au._id) === user._id);
            if (!isAssigned) continue;

            const currentApprover = await getCurrentApproverForTemplateAssignee(
                submission.template_id,
                user._id,
                submission.submission_id,
                submission.edit_count
            );



            if (String(currentApprover.currentApproverUserId) !== String(filterUserId)) continue;

            const mapKey = `${submission.submission_id}`;
            submissionApproverMap.set(mapKey, currentApprover);
            (currentApprover.allowedReassignUserIds || []).forEach(id => allAllowedReassignIds.add(id));
        }

        const reassignUserList = allAllowedReassignIds.size > 0
            ? await UserModel.findAll({
                where: { _id: [...allAllowedReassignIds] },
                attributes: ["_id", "full_name"],
                raw: true
            })
            : [];
        const reassignUserMap = new Map(reassignUserList.map(u => [String(u._id), u]));

        // Build submissions array with template details
        const submissionsWithTemplates = [];

        for (const submission of userSubmissions) {
            const template = templateMap.get(submission.template_id);
            if (!template) continue;

            const plantId = submission.submission_id || 'default';
            const rejectionKey = `${submission.template_id}_${user._id}_${plantId}`;
            
            if (rejectedKeys.has(rejectionKey)) continue;

            const mapKey = `${submission.submission_id}`;
            const currentApprover = submissionApproverMap.get(mapKey);
            
            if (!currentApprover) continue;

            // Get workflow for this template
            const workflow = template.workflow_id ? workflowMap.get(template.workflow_id) : null;
            
            // Filter workflow based on SUBMISSION's plant_id (not user's employee_plant)
            const filteredWorkflow = workflow ? {
                ...workflow,
                workflow: filterGroupUsersForPlant(workflow.workflow, submission.plant_id, template._id)
            } : null;

            // Get approvals for this submission
            const approvalsKey = `${submission.template_id}_${user._id}_${plantId}_${submission.edit_count}`;
            const rawApprovals = approvalsMap.get(approvalsKey) || [];
            const approvals = rawApprovals.map(a => { 
                return {
                ...a,
                approved_by_name: a.approved_by ? approvalUserMap.get(String(a.approved_by)) : null,
                reassign_to_name: a.reassign_user_id ? approvalUserMap.get(String(a.reassign_user_id)) : null,
            }});

            const allowedReassignUserIds = currentApprover.allowedReassignUserIds || [];
            const allowed_reassign_users = allowedReassignUserIds
                .map(id => reassignUserMap.get(String(id)))
                .filter(Boolean)
                .map(u => ({ user_id: u._id, full_name: u.full_name || "" }));

            // All template fields for form_data key resolution (labels + edit)
            const templateFieldsForForm = allTemplateFields.filter(
                tf => tf.template_id === template._id
            );

            submissionsWithTemplates.push({
                submission_id: submission.submission_id,
                submission_edit_count: submission.edit_count,
                plant_id: submission.plant_id,
                plant_detail: submission.plant_detail,
                status: submission.status,
                form_data: submission.form_data,
                submitted_at: submission.submitted_at,
                updated_at: submission.updated_at,
                prev: submission.prev,
                template: {
                    template_id: template._id,
                    template_name: template.template_name,
                    template_type: template.template_type,
                    workflow: filteredWorkflow,
                    approvals: approvals,
                    current_approver_stage: currentApprover.currentStage,
                    allowed_reassign_user_ids: allowedReassignUserIds,
                    allowed_reassign_users: allowed_reassign_users,
                    fields: templateFieldsForForm
                }
            });
        }

        if (submissionsWithTemplates.length === 0) {
            return null;
        }

        return {
            _id: user._id,
            user_id: user.user_id,
            full_name: user.full_name,
            email: user.email,
            employee_plant: user.employee_plant,
            department_id: user.department_id,
            hod_id: user.hod_id,
            submissions: submissionsWithTemplates
        };
    }))
    .then(users => users.filter(user => user !== null));

    return result;
};










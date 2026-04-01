import { AssemblyModal } from "./AssemblyLine.modal.js";
import { PartModal } from "./Part.modal.js";
import { CheckListModal } from "./checkList.modal.js";
import { CheckListHistoryModal } from "./checkListHistory.modal.js";
import { CompanyModel } from "./company.modal.js";
import { NotificationModal } from "./notification.modal.js";
import { PlantModel } from "./plant.modal.js";
import { ProcessModel } from "./process.modal.js";
import { RoleModel } from "./role.modal.js";
import { TypeModal } from "./types.modal.js";
import { UserModel } from "./user.modal.js";
import { DepartmentModel } from "./department.modal.js";
import { ItemCheckTimeModel } from "./itemCheckTime.model.js";
import { GroupUsersModel } from "./groupUsers.model.js";
import { ReleseGroupModel } from "./ReleseGroup.modal.js";
import { TemplateMasterModel } from "./templateMaster.model.js";
import { TemplateFieldModel } from "./templateField.model.js";
import { TemplateSubmissionModel } from "./templateSubmission.model.js";
import { WorkflowModel } from "./workflow.modal.js";
import { WorkflowApprovalModel } from "./workflowApproval.model.js";
import { PlcDataModel } from "./plcData.model.js";
import { PlcProductModel } from "./plcProduct.model.js";
import { QualityCheckModel } from "./qualityCheck.model.js";
import { PlcDashboardModel } from "./plcDashboard.model.js";
import { WorkerConfigModel } from "./workerConfig.model.js";

let modelsInitialized = false;

export const initModels = () => {
    if (modelsInitialized) {
        return;
    }
    CompanyModel.hasMany(PlantModel, { foreignKey: "company_id", as: "plants", constraints: false });
    PlantModel.belongsTo(CompanyModel, { foreignKey: "company_id", as: "company", constraints: false });

    RoleModel.hasMany(UserModel, { foreignKey: "role", as: "users", constraints: false });
    UserModel.belongsTo(RoleModel, { foreignKey: "role", as: "userRole", constraints: false });

    CompanyModel.hasMany(UserModel, { foreignKey: "employee_company", as: "employees", constraints: false });
    UserModel.belongsTo(CompanyModel, { foreignKey: "employee_company", as: "company", constraints: false });

    PlantModel.hasMany(UserModel, { foreignKey: "employee_plant", as: "plant_employees", constraints: false });
    UserModel.belongsTo(PlantModel, { foreignKey: "employee_plant", as: "plant", constraints: false });

    CompanyModel.hasMany(AssemblyModal, { foreignKey: "company_id", as: "assemblies", constraints: false });
    AssemblyModal.belongsTo(CompanyModel, { foreignKey: "company_id", as: "company", constraints: false });

    PlantModel.hasMany(AssemblyModal, { foreignKey: "plant_id", as: "assemblies", constraints: false });
    AssemblyModal.belongsTo(PlantModel, { foreignKey: "plant_id", as: "plant", constraints: false });

    UserModel.hasMany(AssemblyModal, { foreignKey: "responsibility", as: "assigned_assemblies", constraints: false });
    AssemblyModal.belongsTo(UserModel, { foreignKey: "responsibility", as: "responsibleUser", constraints: false });

    PartModal.hasMany(AssemblyModal, { foreignKey: "part_id", as: "assemblies", constraints: false });
    AssemblyModal.belongsToMany(PartModal, { through: "assembly_parts", foreignKey: "part_id", as: "part", constraints: false });

    AssemblyModal.belongsToMany(ProcessModel, {
        through: "assembly_processes",
        foreignKey: "assembly_id",
        otherKey: "process_id",
        as: "processes",
    });
    ProcessModel.belongsToMany(AssemblyModal, {
        through: "assembly_processes",
        foreignKey: "process_id",
        otherKey: "assembly_id",
        as: "assemblies",
    });

    ProcessModel.hasMany(CheckListModal, { foreignKey: "process", as: "checklists", constraints: false });
    CheckListModal.belongsTo(ProcessModel, { foreignKey: "process", as: "processInfo", constraints: false });

    CheckListModal.hasMany(CheckListHistoryModal, { foreignKey: "checkList", as: "histories", constraints: false });
    CheckListHistoryModal.belongsTo(CheckListModal, { foreignKey: "checkList", as: "checklistItem", constraints: false });

    AssemblyModal.hasMany(CheckListHistoryModal, { foreignKey: "assembly", as: "history", constraints: false });
    CheckListHistoryModal.belongsTo(AssemblyModal, { foreignKey: "assembly", as: "assemblyLine", constraints: false });

    ProcessModel.hasMany(CheckListHistoryModal, { foreignKey: "process_id", as: "history", constraints: false });
    CheckListHistoryModal.belongsTo(ProcessModel, { foreignKey: "process_id", as: "processInfo", constraints: false });

    UserModel.hasMany(CheckListHistoryModal, { foreignKey: "user_id", as: "checked_items", constraints: false });
    CheckListHistoryModal.belongsTo(UserModel, { foreignKey: "user_id", as: "user", constraints: false });

    UserModel.hasMany(NotificationModal, { foreignKey: "reciverId", as: "received_notifications", constraints: false });
    NotificationModal.belongsTo(UserModel, { foreignKey: "reciverId", as: "receiver", constraints: false });

    UserModel.hasMany(NotificationModal, { foreignKey: "senderId", as: "sent_notifications", constraints: false });
    NotificationModal.belongsTo(UserModel, { foreignKey: "senderId", as: "sender", constraints: false });

    AssemblyModal.hasMany(NotificationModal, { foreignKey: "assembly", as: "notifications", constraints: false });
    NotificationModal.belongsTo(AssemblyModal, { foreignKey: "assembly", as: "assemblyLine", constraints: false });

    ProcessModel.hasMany(NotificationModal, { foreignKey: "process_id", as: "notifications", constraints: false });
    NotificationModal.belongsTo(ProcessModel, { foreignKey: "process_id", as: "processInfo", constraints: false });

    CheckListModal.hasMany(NotificationModal, { foreignKey: "checkList", as: "notifications", constraints: false });
    NotificationModal.belongsTo(CheckListModal, { foreignKey: "checkList", as: "checklistItem", constraints: false });

    DepartmentModel.hasMany(UserModel, { foreignKey: "department_id", as: "users", constraints: false });
    UserModel.belongsTo(DepartmentModel, { foreignKey: "department_id", as: "department", constraints: false });

    CompanyModel.hasMany(ProcessModel, { foreignKey: "company_id", as: "processes", constraints: false });
    ProcessModel.belongsTo(CompanyModel, { foreignKey: "company_id", as: "company", constraints: false });

    PlantModel.hasMany(ProcessModel, { foreignKey: "plant_id", as: "processes", constraints: false });
    ProcessModel.belongsTo(PlantModel, { foreignKey: "plant_id", as: "plant", constraints: false });

    UserModel.hasMany(GroupUsersModel, { foreignKey: "user_id", as: "groupUsers" });
    GroupUsersModel.belongsTo(UserModel, { foreignKey: "user_id", as: "user" });

    ReleseGroupModel.hasMany(GroupUsersModel, { foreignKey: "relese_group_id", as: "groupUsers" })
    GroupUsersModel.belongsTo(ReleseGroupModel, { foreignKey: "relese_group_id", as: "releaseGroup" })

    UserModel.hasMany(UserModel, { foreignKey: "hod_id", as: "employees" });
    UserModel.belongsTo(UserModel, { foreignKey: "hod_id", as: "hod" });

    TemplateMasterModel.hasMany(TemplateFieldModel, { foreignKey: "template_id", as: "fields", constraints: false });
    TemplateFieldModel.belongsTo(TemplateMasterModel, { foreignKey: "template_id", as: "template", constraints: false });

    UserModel.hasMany(TemplateMasterModel, { foreignKey: "assigned_user", as: "assignedTemplates", constraints: false });
    TemplateMasterModel.belongsTo(UserModel, { foreignKey: "assigned_user", as: "assignedUser", constraints: false });

    WorkflowModel.hasMany(TemplateMasterModel, { foreignKey: "workflow_id", as: "templates", constraints: false });
    TemplateMasterModel.belongsTo(WorkflowModel, { foreignKey: "workflow_id", as: "workflow", constraints: false });

    TemplateMasterModel.hasMany(TemplateSubmissionModel, { foreignKey: "template_id", as: "submissions", constraints: false });
    TemplateSubmissionModel.belongsTo(TemplateMasterModel, { foreignKey: "template_id", as: "template", constraints: false });

    UserModel.hasMany(TemplateSubmissionModel, { foreignKey: "user_id", as: "templateSubmissions", constraints: false });
    TemplateSubmissionModel.belongsTo(UserModel, { foreignKey: "user_id", as: "user", constraints: false });

    WorkflowModel.hasMany(WorkflowApprovalModel, { foreignKey: "workflow_id", as: "approvals", constraints: false });
    WorkflowApprovalModel.belongsTo(WorkflowModel, { foreignKey: "workflow_id", as: "workflow", constraints: false });

    TemplateMasterModel.hasMany(WorkflowApprovalModel, { foreignKey: "template_id", as: "workflowApprovals", constraints: false });
    WorkflowApprovalModel.belongsTo(TemplateMasterModel, { foreignKey: "template_id", as: "template", constraints: false });

    UserModel.hasMany(WorkflowApprovalModel, { foreignKey: "user_id", as: "userWorkflowApprovals", constraints: false });
    WorkflowApprovalModel.belongsTo(UserModel, { foreignKey: "user_id", as: "user", constraints: false });

    UserModel.hasMany(WorkflowApprovalModel, { foreignKey: "approved_by", as: "approvedByWorkflowApprovals", constraints: false });
    WorkflowApprovalModel.belongsTo(UserModel, { foreignKey: "approved_by", as: "approvedBy", constraints: false });

    UserModel.hasMany(WorkflowApprovalModel, { foreignKey: "reassign_user_id", as: "reassignUserWorkflowApprovals", constraints: false });
    WorkflowApprovalModel.belongsTo(UserModel, { foreignKey: "reassign_user_id", as: "reassignUser", constraints: false });

    CheckListModal.hasMany(ItemCheckTimeModel, { foreignKey: "item_id", as: "time" });
    ItemCheckTimeModel.belongsTo(CheckListModal, { foreignKey: "item_id", as: "checklistItem" });

    TemplateSubmissionModel.hasMany(WorkflowApprovalModel, { foreignKey: "submission_id", as: "approvals", constraints: false });
    WorkflowApprovalModel.belongsTo(TemplateSubmissionModel, { foreignKey: "submission_id", as: "submission", constraints: false });

    ReleseGroupModel.hasMany(TemplateFieldModel, {
        foreignKey: "group_id",
        as: "templateFields",
        constraints: false,
    });
    TemplateFieldModel.belongsTo(ReleseGroupModel, {
        foreignKey: "group_id",
        as: "releaseGroup",
        constraints: false,
    });

    PlantModel.hasMany(TemplateSubmissionModel, { foreignKey: "plant_id", as: "plantSubmissions" });
    TemplateSubmissionModel.belongsTo(PlantModel, { foreignKey: "plant_id", as: "plant" });
    
    PlcDataModel.belongsTo(CompanyModel, { foreignKey: "company_name", targetKey: "company_name", as: "company", constraints: false });
    PlcDataModel.belongsTo(PlantModel, { foreignKey: "plant_name", targetKey: "plant_name", as: "plant", constraints: false });

    PlcProductModel.belongsTo(CompanyModel, { foreignKey: "company_name", targetKey: "company_name", as: "company", constraints: false });
    PlcProductModel.belongsTo(PlantModel, { foreignKey: "plant_name", targetKey: "plant_name", as: "plant", constraints: false });

    QualityCheckModel.belongsTo(CompanyModel, { foreignKey: "company_name", targetKey: "company_name", as: "company", constraints: false });
    QualityCheckModel.belongsTo(PlantModel, { foreignKey: "plant_name", targetKey: "plant_name", as: "plant", constraints: false });



    modelsInitialized = true;

    return {
        AssemblyModal,
        PartModal,
        CheckListModal,
        CheckListHistoryModal,
        CompanyModel,
        NotificationModal,
        PlantModel,
        ProcessModel,
        RoleModel,
        TypeModal,
        UserModel,
        WorkflowApprovalModel,
        PlcDataModel,
        PlcProductModel,
        QualityCheckModel,
        PlcDashboardModel,
        WorkerConfigModel
    };
};


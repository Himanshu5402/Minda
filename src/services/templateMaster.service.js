// @ts-nocheck
import { Op, Sequelize } from 'sequelize'
import { TemplateMasterModel, ASSIGNED_USER_STATUS_ENUM } from '../models/templateMaster.model.js'
import { TemplateFieldModel } from '../models/templateField.model.js'
import { UserModel } from '../models/user.modal.js'
import { WorkflowModel } from '../models/workflow.modal.js'
import { WorkflowApprovalModel } from '../models/workflowApproval.model.js'
import { GroupUsersModel } from '../models/groupUsers.model.js'
import { BadRequestError, NotFoundError } from '../utils/errorHandler.js'
import { ReleseGroupModel } from '../models/ReleseGroup.modal.js'
import { PlantModel } from '../models/plant.modal.js'
import { TemplateSubmissionModel } from '../models/templateSubmission.model.js'

// Normalize to [{ user_id, status }]. Accepts: [id], [{ user_id, status? }], [{ _id }]
function toAssignedUsersArray(raw) {
  if (!raw) return null
  if (!Array.isArray(raw) || raw.length === 0) return null
  const out = raw
    .map((x) => {
      if (typeof x === 'string' && x) return { user_id: String(x), status: 'pending' }
      if (x && typeof x === 'object' && (x.user_id != null || x._id != null)) {
        return {
          user_id: String(x.user_id ?? x._id),
          status: ASSIGNED_USER_STATUS_ENUM.includes(x.status) ? x.status : 'pending',
        }
      }
      return null
    })
    .filter(Boolean)
  return out.length ? out : null
}

function extractUserIds(arr) {
  if (!Array.isArray(arr)) return []
  return arr.map((x) => (typeof x === 'string' ? x : x && (x.user_id || x._id))).filter(Boolean)
}

const assignedUserInclude = {
  model: UserModel,
  as: 'assignedUser',
  required: false,
  attributes: ['_id', 'full_name', 'email', 'user_id', 'additional_plants', 'employee_plant'],
}

const workflowInclude = {
  model: WorkflowModel,
  as: 'workflow',
  required: false,
  attributes: ['_id', 'name'],
}

const templateFieldsInclude = {
  model: TemplateFieldModel,
  as: 'fields',
  required: false,
}

export const createTemplateService = async ({
  template_name,
  template_type,
  assigned_user,
  assigned_users,
}) => {
  const name = (template_name || '').trim()
  if (!name) {
    throw new BadRequestError('Template Name is required', 'createTemplateService()')
  }

  const exist = await TemplateMasterModel.findOne({
    where: { template_name: { [Op.eq]: name } },
  })
  if (exist) {
    throw new BadRequestError('Template already exists', 'createTemplateService()')
  }

  // assigned_users: [{ user_id, status }]. Accepts [id] or [{ user_id, status? }] or [{ _id }]
  let assignedUsersArray = null
  if (assigned_users && Array.isArray(assigned_users) && assigned_users.length > 0) {
    assignedUsersArray = toAssignedUsersArray(assigned_users)
    const ids = extractUserIds(assigned_users)
    for (const uid of ids) {
      const user = await UserModel.findByPk(uid)
      if (!user)
        throw new BadRequestError(`Assigned user ${uid} not found`, 'createTemplateService()')
    }
  } else if (assigned_user) {
    const userId = String(assigned_user).trim()
    if (userId) {
      const user = await UserModel.findByPk(userId)
      if (!user) throw new BadRequestError('Assigned user not found', 'createTemplateService()')
      assignedUsersArray = [{ user_id: userId, status: 'pending' }]
    }
  }

  const firstUserId =
    assignedUsersArray && assignedUsersArray.length > 0 ? assignedUsersArray[0].user_id : null

  const created = await TemplateMasterModel.create({
    template_name: name,
    template_type: template_type || null,
    assigned_user: firstUserId,
    assigned_users: assignedUsersArray,
  })

  return created
}

export const listTemplatesService = async (skip, limit) => {
  return await TemplateMasterModel.findAll({
    include: [assignedUserInclude, workflowInclude],
    offset: skip,
    limit,
    order: [['createdAt', 'DESC']],
  })
}

export const getTemplateByIdService = async (
  isAdmin,
  id,
  user_id,
  excludeSubmissionOnly = false,
) => {
  const result = await TemplateMasterModel.findByPk(id, {
    include: [templateFieldsInclude, workflowInclude],
  })

  if (!result) {
    throw new NotFoundError('Template not found', 'getTemplateByIdService()')
  }

  // convert Sequelize instance → plain object
  const plainResult = result.get({ plain: true })
  console.log("plainresult",plainResult)

  // sort fields
  if (Array.isArray(plainResult.fields)) {
    plainResult.fields.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  }

  // sirf Manage Template preview ke liye: is_submission_only fields hide
  if (excludeSubmissionOnly && Array.isArray(plainResult.fields)) {
    plainResult.fields = plainResult.fields.filter((f) => !f.is_submission_only)
  }

  // filter User type fields
  if (!isAdmin) {
    plainResult.assigned_users = plainResult.assigned_users?.filter(
      (au) => au.user_id === user_id,
    )[0]
    if (plainResult.assigned_users) {
      plainResult.fields = plainResult.fields.filter(
        (item) => item.type === 'User' || item.type === 'HOD' || item.type === 'Approval',
      )
      plainResult.assignedUser = await UserModel.findOne({
        where: {
          _id: plainResult.assigned_users?.user_id,
        },
        attributes: ['_id', 'full_name', 'email', 'user_id', 'additional_plants', 'employee_plant'],
      })
    }
  }

  if (plainResult.assignedUser) {
    const additionalPlants = Array.isArray(plainResult.assignedUser.additional_plants)
      ? plainResult.assignedUser.additional_plants
      : []

    const allPlantIds = [...additionalPlants, plainResult.assignedUser.employee_plant].filter(Boolean)
    plainResult.assignedUser.additional_plants = allPlantIds

    if (allPlantIds.length > 0) {
      plainResult.plant_option = await PlantModel.findAll({
        where: {
          _id: { [Op.in]: allPlantIds },
        },
        attributes: ['_id', 'plant_name', 'plant_code'],
      })
    } else {
      plainResult.plant_option = []
    }
  }

  plainResult.fields = await Promise.all(
    plainResult.fields.map(async (field) => {
      if (field.type === 'Approval') {
        const getGroup = await ReleseGroupModel.findByPk(field.group_id)
        return {
          ...field,
          groupDetail: getGroup ? getGroup.toJSON() : null,
        }
      }
      return field
    }),
  )

  plainResult.assigned_users = await UserModel.findAll({
    where: {
      _id: { [Op.in]: result.assigned_users ? result.assigned_users.map((u) => u.user_id) : [] },
    },
    attributes: ['_id', 'full_name', 'email', 'user_id', 'additional_plants', 'employee_plant'],
  })
  return plainResult
}

export const addFieldToTemplateService = async (
  templateId,
  {
    field_name,
    field_type,
    is_mandatory,
    sort_order,
    dropdown_options,
    type,
    group_id,
    parent_id,
    is_submission_only,
  },
) => {
  const template = await TemplateMasterModel.findByPk(templateId)
  if (!template) {
    throw new NotFoundError('Template not found', 'addFieldToTemplateService()')
  }

  const name = (field_name || '').trim()
  if (!name) {
    throw new BadRequestError('Field Name is required', 'addFieldToTemplateService()')
  }
  if (!field_type) {
    throw new BadRequestError('Field Type is required', 'addFieldToTemplateService()')
  }

  let dropdownOptionsString = null
  if (field_type === 'DROPDOWN' || field_type === 'RADIO') {
    if (!dropdown_options || (Array.isArray(dropdown_options) && dropdown_options.length === 0)) {
      throw new BadRequestError(
        `Options are required for ${field_type} field type`,
        'addFieldToTemplateService()',
      )
    }
    // allow array or comma-separated string
    let arr = []
    if (Array.isArray(dropdown_options)) {
      arr = dropdown_options.map((x) => String(x).trim()).filter(Boolean)
    } else if (typeof dropdown_options === 'string') {
      arr = dropdown_options
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    }
    if (arr.length === 0) {
      throw new BadRequestError(
        `Options are required for ${field_type} field type`,
        'addFieldToTemplateService()',
      )
    }
    dropdownOptionsString = JSON.stringify(arr)
  }

  const created = await TemplateFieldModel.create({
    template_id: templateId,
    field_name: name,
    field_type,
    is_mandatory: Boolean(is_mandatory),
    sort_order: Number.isFinite(Number(sort_order)) ? Number(sort_order) : 0,
    dropdown_options: dropdownOptionsString,
    type,
    group_id,
    parent_id,
    is_submission_only: Boolean(is_submission_only),
  })

  return created
}

export const updateFieldService = async (
  fieldId,
  { field_name, field_type, is_mandatory, dropdown_options, group_id, type, parent_id },
) => {
  const field = await TemplateFieldModel.findByPk(fieldId)
  if (!field) {
    throw new NotFoundError('Field not found', 'updateFieldService()')
  }

  const name = (field_name || '').trim()
  if (!name) {
    throw new BadRequestError('Field Name is required', 'updateFieldService()')
  }
  if (!field_type) {
    throw new BadRequestError('Field Type is required', 'updateFieldService()')
  }

  let dropdownOptionsString = null
  if (field_type === 'DROPDOWN' || field_type === 'RADIO') {
    if (!dropdown_options || (Array.isArray(dropdown_options) && dropdown_options.length === 0)) {
      throw new BadRequestError(
        `Options are required for ${field_type} field type`,
        'updateFieldService()',
      )
    }
    let arr = []
    if (Array.isArray(dropdown_options)) {
      arr = dropdown_options.map((x) => String(x).trim()).filter(Boolean)
    } else if (typeof dropdown_options === 'string') {
      arr = dropdown_options
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    }
    if (arr.length === 0) {
      throw new BadRequestError(
        `Options are required for ${field_type} field type`,
        'updateFieldService()',
      )
    }
    dropdownOptionsString = JSON.stringify(arr)
  }

  await field.update({
    field_name: name,
    field_type,
    is_mandatory: Boolean(is_mandatory),
    dropdown_options: dropdownOptionsString,
    parent_id,
    group_id,
    type,
  })

  return field
}

export const deleteFieldService = async (fieldId) => {
  const field = await TemplateFieldModel.findByPk(fieldId)
  if (!field) {
    throw new NotFoundError('Field not found', 'deleteFieldService()')
  }
  await field.destroy()
  return true
}

export const updateTemplateService = async (
  templateId,
  { template_name, template_type, assigned_user, assigned_users },
) => {
  const template = await TemplateMasterModel.findByPk(templateId)
  if (!template) {
    throw new NotFoundError('Template not found', 'updateTemplateService()')
  }

  const name = (template_name || '').trim()
  if (!name) {
    throw new BadRequestError('Template Name is required', 'updateTemplateService()')
  }

  // Check if another template with same name exists (excluding current template)
  const exist = await TemplateMasterModel.findOne({
    where: {
      template_name: { [Op.eq]: name },
      _id: { [Op.ne]: templateId },
    },
  })
  if (exist) {
    throw new BadRequestError('Template already exists', 'updateTemplateService()')
  }

  // assigned_users: [{ user_id, status }]. Accepts [id] or [{ user_id, status? }]. Merge with existing to preserve status when only ids sent.
  let assignedUsersArray = template.assigned_users || []
  if (assigned_users !== undefined) {
    if (assigned_users === null || (Array.isArray(assigned_users) && assigned_users.length === 0)) {
      assignedUsersArray = null
    } else if (Array.isArray(assigned_users) && assigned_users.length > 0) {
      let toSave = toAssignedUsersArray(assigned_users)
      if (toSave) {
        const existing = template.assigned_users || []
        for (const t of toSave) {
          const e = existing.find((x) => x && x.user_id === t.user_id)
          if (e && e.status && ASSIGNED_USER_STATUS_ENUM.includes(e.status)) t.status = e.status
        }
        const ids = toSave.map((o) => o.user_id)
        for (const uid of ids) {
          const user = await UserModel.findByPk(uid)
          if (!user)
            throw new BadRequestError(`Assigned user ${uid} not found`, 'updateTemplateService()')
        }
        assignedUsersArray = toSave
      }
    }
  } else if (assigned_user !== undefined) {
    if (assigned_user === null || assigned_user === '') {
      assignedUsersArray = null
    } else {
      const userId = String(assigned_user).trim()
      if (userId) {
        const user = await UserModel.findByPk(userId)
        if (!user) throw new BadRequestError('Assigned user not found', 'updateTemplateService()')
        assignedUsersArray = [{ user_id: userId, status: 'pending' }]
      } else {
        assignedUsersArray = null
      }
    }
  }

  const firstUserId =
    assignedUsersArray && assignedUsersArray.length > 0 ? assignedUsersArray[0].user_id : null

  await template.update({
    template_name: name,
    template_type: template_type || null,
    assigned_user: firstUserId,
    assigned_users: assignedUsersArray,
  })

  return template
}

export const deleteTemplateService = async (templateId) => {
  const template = await TemplateMasterModel.findByPk(templateId)
  if (!template) {
    throw new NotFoundError('Template not found', 'deleteTemplateService()')
  }

  // Delete all fields associated with this template first
  await TemplateFieldModel.destroy({
    where: { template_id: templateId },
  })

  // Then delete the template
  await template.destroy()
  return true
}

export const getAssignedTemplatesService = async (userId, limit, skip) => {
  // Fetch all active templates
  const allTemplates = await TemplateMasterModel.findAll({
    where: {
      is_active: true,
    },
    include: [templateFieldsInclude, assignedUserInclude],
    order: [['createdAt', 'ASC']],
  })

  // console.log(allTemplates[0].dataValues.fields);

  // Sequelize 'order' inside include does not reliably sort hasMany; sort in-memory
  allTemplates.forEach((t) => {
    if (t.fields && Array.isArray(t.fields)) {
      t.fields.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    }
  })

  // console.log(templateFields);
  // Filter templates where user is in assigned_user or in assigned_users[].user_id
  const assignedTemplates = allTemplates.filter((template) => {
    if (template.assigned_user === userId) return true
    const list = template.assigned_users || []
    return list?.filter(
      (a) => a && (a?.user_id === userId || (typeof a === 'string' && a === userId)),
    )
  })
  const filteredData = assignedTemplates
    .map((item) => {
      const plainItem = item.toJSON() // 🔥 IMPORTANT

      const filteredUser = plainItem.assigned_users?.find((as) => as.user_id === userId)
      console.log('>>>>>>', filteredUser)

      return {
        ...plainItem,
        assigned_users: filteredUser || null,
      }
    })
    .filter((item) => item.assigned_users && item.assigned_users.user_id === userId)
    .slice(skip, skip + limit)

  return filteredData
}

export const getTemplateStatusListService = async (
  skip = 0,
  limit = 10,
  search = '',
  status = '',
  userId = null,
  isAdmin = false,
) => {
  const trimmedSearch = typeof search === 'string' ? search.trim() : ''
  const normalizedStatus = typeof status === 'string' ? status.trim().toLowerCase() : ''
  const workflowStatusFilters = new Set([
    'approved',
    'in-progress',
    'pending',
    're-assign',
    'rejected',
  ])
  const isWorkflowStatusFilter = workflowStatusFilters.has(normalizedStatus)
  const isAssignedStatusFilter =
    ASSIGNED_USER_STATUS_ENUM.includes(normalizedStatus) && !isWorkflowStatusFilter
  const usePostFilter = isAssignedStatusFilter || isWorkflowStatusFilter

  const baseWhere = isAdmin ? {} : { user_id: userId }

  if (trimmedSearch) {
    const like = `%${trimmedSearch}%`
    const [matchedTemplates, matchedUsers, matchedPlants] = await Promise.all([
      TemplateMasterModel.findAll({
        where: { template_name: { [Op.like]: like } },
        attributes: ['_id'],
      }),
      UserModel.findAll({
        where: {
          [Op.or]: [
            { full_name: { [Op.like]: like } },
            { email: { [Op.like]: like } },
            { user_id: { [Op.like]: like } },
          ],
        },
        attributes: ['_id'],
      }),
      PlantModel.findAll({
        where: {
          [Op.or]: [{ plant_name: { [Op.like]: like } }, { plant_code: { [Op.like]: like } }],
        },
        attributes: ['_id'],
      }),
    ])

    const templateIds = matchedTemplates.map((t) => t._id)
    const userIds = matchedUsers.map((u) => u._id)
    const plantIds = matchedPlants.map((p) => p._id)

    if (!templateIds.length && !userIds.length && !plantIds.length) {
      return []
    }

    baseWhere[Op.and] = [
      {
        [Op.or]: [
          templateIds.length ? { template_id: { [Op.in]: templateIds } } : null,
          userIds.length ? { user_id: { [Op.in]: userIds } } : null,
          plantIds.length ? { plant_id: { [Op.in]: plantIds } } : null,
        ].filter(Boolean),
      },
    ]
  }

  const submissionQuery = {
    where: baseWhere,
    include: [
      { model: PlantModel, as: 'plant', attributes: ['_id', 'plant_name', 'plant_code'] },
      { model: UserModel, as: 'user', attributes: ['_id', 'full_name', 'email', 'user_id'] },
    ],
    attributes: ['_id', 'template_id', 'user_id', 'status', 'createdAt', 'plant_id'],
  }

  if (!usePostFilter) {
    submissionQuery.limit = limit
    submissionQuery.offset = skip
  }

  const SubmitionData = await TemplateSubmissionModel.findAll(submissionQuery)

  const templateIds = [...new Set(SubmitionData.map((item) => item.template_id))]
  const userIds = [...new Set(SubmitionData.map((item) => item.user_id))]

  // Fetch all templates with workflow
  const templateDataByIds = await TemplateMasterModel.findAll({
    where: { _id: { [Op.in]: templateIds } },
    attributes: [
      '_id',
      'template_name',
      'template_type',
      'is_active',
      'workflow_id',
      'assigned_users',
    ],
    include: [
      {
        model: WorkflowModel,
        as: 'workflow',
        required: false,
      },
    ],
  })

  // Fetch workflow approvals for these templates and users
  const workflowApprovals = await WorkflowApprovalModel.findAll({
    where: {
      template_id: templateIds,
      user_id: userIds,
    },
    include: [
      {
        model: UserModel,
        as: 'reassignUser',
        attributes: ['full_name', 'email', 'desigination', 'user_id'],
      },
    ],
    order: [
      ['current_stage', 'ASC'],
      ['createdAt', 'ASC'],
    ],
  })

  // Collect all group IDs from workflows
  const allGroupIds = new Set()
  templateDataByIds.forEach((template) => {
    if (template.workflow && template.workflow.workflow) {
      template.workflow.workflow.forEach((wf) => {
        if (wf.group && wf.group !== 'HOD') {
          allGroupIds.add(wf.group)
        }
      })
    }
  })

  // Collect all HOD IDs and user IDs from submissions
  const allHodIds = new Set()
  const allUserFullIds = new Set()

  SubmitionData.forEach((item) => {
    if (item.user && item.user._id) {
      allUserFullIds.add(item.user._id)
    }
  })

  // Fetch user details to get HOD IDs
  const users = await UserModel.findAll({
    where: { _id: Array.from(allUserFullIds) },
    attributes: [
      '_id',
      'full_name',
      'email',
      'desigination',
      'user_id',
      'is_hod',
      'employee_plant',
      'hod_id',
    ],
  })

  users.forEach((user) => {
    if (user.hod_id) {
      allHodIds.add(user.hod_id)
    }
  })

  // Fetch groups and release groups
  const groups = await GroupUsersModel.findAll({
    where: { relese_group_id: Array.from(allGroupIds) },
  })

  const releaseGroups = await ReleseGroupModel.findAll({
    where: { _id: Array.from(allGroupIds) },
    attributes: ['_id', 'group_name', 'group_department'],
  })

  // Collect all group user IDs
  const allGroupUserIds = new Set()
  groups.forEach((g) => {
    allGroupUserIds.add(g.user_id)
  })

  // Collect approved_by IDs from approvals
  const allApprovedByIds = new Set()
  workflowApprovals.forEach((approval) => {
    if (approval.approved_by) {
      allApprovedByIds.add(approval.approved_by)
    }
  })

  // Fetch all necessary users
  const hodUsers = await UserModel.findAll({
    where: { _id: Array.from(allHodIds) },
    attributes: [
      '_id',
      'full_name',
      'email',
      'desigination',
      'user_id',
      'is_hod',
      'employee_plant',
    ],
  })

  const groupUsers = await UserModel.findAll({
    where: { _id: Array.from(allGroupUserIds) },
    attributes: [
      '_id',
      'full_name',
      'email',
      'desigination',
      'user_id',
      'is_hod',
      'employee_plant',
    ],
  })

  const approvedByUsers = await UserModel.findAll({
    where: { _id: Array.from(allApprovedByIds) },
    attributes: [
      '_id',
      'full_name',
      'email',
      'desigination',
      'user_id',
      'is_hod',
      'employee_plant',
    ],
  })

  // Create maps
  const userMap = new Map(users.map((u) => [u._id, u.toJSON()]))
  const hodUserMap = new Map(hodUsers.map((u) => [u._id, u.toJSON()]))
  const groupUserMap = new Map(groupUsers.map((u) => [u._id, u.toJSON()]))
  const releaseGroupMap = new Map(releaseGroups.map((rg) => [rg._id, rg.toJSON()]))
  const approvedByUserMap = new Map(approvedByUsers.map((u) => [u._id, u.toJSON()]))

  const groupMap = new Map()
  groups.forEach((g) => {
    const groupJson = g.toJSON()
    if (!groupMap.has(groupJson.relese_group_id)) {
      groupMap.set(groupJson.relese_group_id, [])
    }
    groupMap.get(groupJson.relese_group_id).push(groupJson)
  })

  // Create approval map
  const approvalMap = new Map()
  const rejectionStageMap = new Map()

  workflowApprovals.forEach((approval) => {
    const approvalJson = approval.toJSON()

    // Add approved_by user details
    if (approvalJson.approved_by) {
      approvalJson.approved_by_user = approvedByUserMap.get(approvalJson.approved_by) || null
    }

    // Track rejection
    const isRejected =
      (approvalJson.status || '').toLowerCase() === 'reject' || approvalJson.status === 'rejected'
    if (isRejected) {
      const rejectKey = `${approvalJson.template_id}-${approvalJson.user_id}-${approvalJson.submission_id}`
      const existing = rejectionStageMap.get(rejectKey)
      if (existing === undefined || approvalJson.current_stage < existing) {
        rejectionStageMap.set(rejectKey, approvalJson.current_stage)
      }
    }

    const key = `${approvalJson.template_id}-${approvalJson.workflow_id}-${approvalJson.approved_by}-${approvalJson.user_id}-${approvalJson.submission_id}`
    if (!approvalMap.has(key)) {
      approvalMap.set(key, [])
    }
    approvalMap.get(key).push(approvalJson)
  })

  // Create template map with workflow processing
  const templateMap = new Map()

  templateDataByIds.forEach((template) => {
    const templateJson = template.toJSON()
    templateMap.set(templateJson._id, templateJson)
  })

  // Build final response
  const finalData = SubmitionData.map((item) => {
    const template = templateMap.get(item.template_id)
    const currentUser = userMap.get(item.user_id)

    let workflowWithApprovals = null

    if (template && template.workflow && currentUser) {
      const workflowForUser = JSON.parse(JSON.stringify(template.workflow))

      // console.log('this is workflow', workflowForUser)

      if (workflowForUser && workflowForUser.workflow) {
        const rejectKey = `${template._id}-${item.user_id}`
        const rejectionStage = rejectionStageMap.get(rejectKey)
        const workflowStages = workflowForUser.workflow
        // rejectionStage != null
        //   ? workflowForUser.workflow.filter((_, idx) => idx <= rejectionStage)
        //   : workflowForUser.workflow

        workflowForUser.workflow = workflowStages.map((wf, stageIndex) => {
          let groupDetail = null
          let groupInfo = null
          let expectedApproverUserId = null

          if (wf.group === 'HOD') {
            groupDetail =
              currentUser && currentUser.hod_id ? hodUserMap.get(currentUser.hod_id) || null : null
            groupInfo = { group_name: 'HOD', group_department: null }
            expectedApproverUserId = currentUser?.hod_id || null
          } else {
            const groupDetailsArray = groupMap.get(wf.group) || []
            const matchedUser = groupDetailsArray.find((gd) => {
              try {
                const plantsArray = JSON.parse(gd.plants_id)
                return currentUser && plantsArray.includes(currentUser.employee_plant)
              } catch {
                return false
              }
            })

            groupDetail = matchedUser ? groupUserMap.get(matchedUser.user_id) || null : null
            groupInfo = releaseGroupMap.get(wf.group) || null
            expectedApproverUserId = matchedUser?.user_id || null
          }

          const approvalKey = `${template._id}-${template.workflow_id}-${expectedApproverUserId}-${item.user_id}-${item._id}`
          const stageApprovals = approvalMap.get(approvalKey) || []

          return {
            ...wf,
            group_name: groupInfo?.group_name || null,
            group_department: groupInfo?.group_department || null,
            groupDetail: groupDetail,
            approvals: stageApprovals,
          }
        })

        workflowWithApprovals = workflowForUser
      }
    }

    const filteredApprovals = workflowApprovals
      .filter(
        (wa) =>
          wa.template_id === item.template_id &&
          wa.user_id === item.user_id &&
          wa.submission_id === item._id,
      )
      .map((approval) => {
        const approvalJson = approval.toJSON ? approval.toJSON() : approval

        // Add approved_by user details
        if (approvalJson.approved_by) {
          approvalJson.approved_by_user = approvedByUserMap.get(approvalJson.approved_by) || null
        }

        return approvalJson
      })

    const assignedStatus = template
      ? template.assigned_users?.find((u) => String(u.user_id) === String(item.user_id))?.status ||
        null
      : null

    return {
      ...item.dataValues,
      template_data: template
        ? {
            ...template,
            workflow: workflowWithApprovals,
          }
        : null,
      approval: filteredApprovals,
      assigned_status: assignedStatus,
      template_status:
  workflowWithApprovals?.workflow.length > 0
    ? filteredApprovals.some(it => it.status === "rejected")
      ? "rejected"
      : filteredApprovals.filter(
          (it) =>
            it.current_stage === workflowWithApprovals?.workflow.length - 1 &&
            it.status === "approved"
        ).length > 0
      ? "approved"
      : "in-progress"
    : "pending"
    }
  })

  if (isAssignedStatusFilter) {
    const filtered = finalData.filter((row) => row.assigned_status === normalizedStatus)
    return filtered.slice(skip, skip + limit)
  }

  if (isWorkflowStatusFilter) {
    const filtered = finalData.filter((row) => row.template_status === normalizedStatus)
    return filtered.slice(skip, skip + limit)
  }

  return finalData
}

export const assignWorkflowToTemplateService = async (templateId, workflowId) => {
  // Validate template exists
  const template = await TemplateMasterModel.findByPk(templateId)
  if (!template) {
    throw new NotFoundError('Template not found', 'assignWorkflowToTemplateService()')
  }

  // Validate workflow exists (if workflowId is provided)
  if (workflowId) {
    const workflow = await WorkflowModel.findByPk(workflowId)
    if (!workflow) {
      throw new NotFoundError('Workflow not found', 'assignWorkflowToTemplateService()')
    }
  }

  // Update template with workflow_id (can be null to unassign)
  await template.update({
    workflow_id: workflowId || null,
  })

  return template
}

/**
 * Returns workflow approval chain: HOD -> only the approver to whom approval goes.
 * Approver is chosen by plant match: release group user whose plants_id matches assigned user's employee_plant.
 * @param {object} options - { fullChain: true } to return full chain without filtering assignee (for current-approver computation).
 */
export const getTemplateWorkflowStatusService = async (
  templateId,
  assignedUserId = null,
  options = {},
) => {
  const { fullChain = false } = options
  const template = await TemplateMasterModel.findByPk(templateId, {
    include: [
      {
        model: WorkflowModel,
        as: 'workflow',
        required: false,
        attributes: ['_id', 'name', 'workflow'],
      },
    ],
  })
  if (!template) {
    throw new NotFoundError('Template not found', 'getTemplateWorkflowStatusService()')
  }
  const w = template.workflow
  const workflowName = w != null && w.name != null ? w.name : null
  const workflowId = template.workflow_id != null ? template.workflow_id : null
  const steps = Array.isArray(w && w.workflow) ? w.workflow : []
  if (!steps.length) {
    return {
      template_id: template._id,
      template_name: template.template_name,
      workflow_id: workflowId,
      workflow_name: workflowName || null,
      chain: [],
    }
  }

  let assignedUserPlantId = null
  let assignedUserHodId = null
  if (assignedUserId) {
    const assignedUser = await UserModel.findOne({
      where: { _id: assignedUserId },
      attributes: ['employee_plant', 'hod_id'],
      raw: true,
    })
    assignedUserPlantId =
      assignedUser && assignedUser.employee_plant != null ? assignedUser.employee_plant : null
    assignedUserHodId =
      assignedUser && assignedUser.hod_id != null ? String(assignedUser.hod_id) : null
  }

  const chain = []
  let stageIndex = 0
  const releaseGroupIds = steps
    .filter((s) => s.group && String(s.group) !== 'HOD')
    .map((s) => s.group)

  const hodUserIdsFromSteps = steps
    .filter((s) => s.group === 'HOD' && s.user && String(s.user).trim())
    .map((s) => String(s.user).trim())
  const hodUserIds = [
    ...new Set([...hodUserIdsFromSteps, ...(assignedUserHodId ? [assignedUserHodId] : [])]),
  ]
  const hodUsers =
    hodUserIds.length > 0
      ? await UserModel.findAll({
          where: { _id: { [Op.in]: hodUserIds } },
          attributes: ['_id', 'full_name'],
          raw: true,
        })
      : []
  const hodNameById = Object.fromEntries((hodUsers || []).map((u) => [u._id, u.full_name || 'HOD']))

  let groupUsers = []
  if (releaseGroupIds.length) {
    groupUsers = await GroupUsersModel.findAll({
      where: { relese_group_id: { [Op.in]: releaseGroupIds } },
      include: [
        { model: UserModel, as: 'user', attributes: ['_id', 'full_name'], required: false },
      ],
      order: [['createdAt', 'ASC']],
    })
  }
  const groupUsersByGroup = new Map()
  for (const gu of groupUsers) {
    const gid =
      gu.relese_group_id != null ? gu.relese_group_id : gu.get && gu.get('relese_group_id')
    if (!groupUsersByGroup.has(gid)) groupUsersByGroup.set(gid, [])
    groupUsersByGroup.get(gid).push(gu)
  }

  for (const step of steps) {
    if (step.group === 'HOD') {
      // Use assignee's HOD when available, so "pending for HOD" shows on correct HOD's queue
      const hodUserId = assignedUserHodId || (step.user && String(step.user).trim()) || null
      const hodLabel =
        hodUserId && hodNameById[hodUserId] ? `${hodNameById[hodUserId]} (HOD)` : 'HOD'
      chain.push({ stage_index: stageIndex, type: 'HOD', label: hodLabel, user_id: hodUserId })
      stageIndex++
    } else if (step.group) {
      const users = groupUsersByGroup.get(step.group) || []
      // Workflow order: only add the user whose plant matches assigned user's plant (same logic as getAssignedTemplatesService)
      const matchedUser =
        assignedUserPlantId != null
          ? users.find((gu) => {
              try {
                const plantsArray = JSON.parse(gu.plants_id || '[]')
                return plantsArray.includes(assignedUserPlantId)
              } catch {
                return false
              }
            })
          : users[0] || null // If no assigned user/plant, fallback to first user
      if (matchedUser) {
        const u =
          matchedUser.user != null ? matchedUser.user : matchedUser.get && matchedUser.get('user')
        const uName =
          u &&
          (u.full_name != null
            ? u.full_name
            : typeof u.get === 'function'
              ? u.get('full_name')
              : null)
        const label = uName || matchedUser.user_id || '—'
        const uid =
          matchedUser.user_id != null
            ? matchedUser.user_id
            : matchedUser.get && matchedUser.get('user_id')
        chain.push({
          stage_index: stageIndex,
          type: 'user',
          label: String(label),
          user_id: uid,
        })
        stageIndex++
      }
    }
  }

  const isAssignedUser = (c) =>
    assignedUserId && c.user_id && String(c.user_id) === String(assignedUserId)

  const approvalWhere = { template_id: templateId }
  if (assignedUserId) {
    approvalWhere.user_id = assignedUserId
  }
  const approvals = await WorkflowApprovalModel.findAll({
    where: approvalWhere,
    order: [['createdAt', 'ASC']],
    attributes: [
      'current_stage',
      'status',
      'remarks',
      'approved_by',
      'reassign_user_id',
      'createdAt',
    ],
  })
  const approvalByStage = {}
  for (const a of approvals) {
    approvalByStage[a.current_stage] = a
  }

  let chainWithStatus = chain.map((c) => {
    const appr = approvalByStage[c.stage_index]
    const row = appr && (appr.toJSON ? appr.toJSON() : appr)
    return {
      stage_index: c.stage_index,
      type: c.type,
      label: c.label,
      user_id: c.user_id != null ? c.user_id : null,
      status: row && row.status != null ? row.status : null,
      approved_at: row && row.createdAt != null ? row.createdAt : null,
      remarks: row && row.remarks != null ? row.remarks : null,
      approved_by: row && row.approved_by != null ? row.approved_by : null,
    }
  })

  if (assignedUserId && !fullChain) {
    chainWithStatus = chainWithStatus.filter((c) => !isAssignedUser(c))
  }

  return {
    template_id: template._id,
    template_name: template.template_name,
    workflow_id: workflowId,
    workflow_name: workflowName,
    chain: chainWithStatus,
  }
}

/**
 * Returns who currently has this template in their approval queue (for template + assignee).
 * Used to filter "pending for me" list: show template only to currentApproverUserId.
 * Handles reassign: if last action is reassigned, current approver = reassign_user_id.
 */
export const getCurrentApproverForTemplateAssignee = async (
  templateId,
  assigneeUserId,
  submission_id,
  edit_count,
) => {
  const status = await getTemplateWorkflowStatusService(templateId, assigneeUserId, {
    fullChain: true,
  })
  const chain = status.chain || []
  if (!chain.length)
    return {
      currentApproverUserId: null,
      currentStage: null,
      isRejected: false,
      isCompleted: true,
      allowedReassignUserIds: [],
    }

  const approvals = await WorkflowApprovalModel.findAll({
    where: {
      template_id: templateId,
      user_id: assigneeUserId,
      submission_id: submission_id,
      edit_count,
    },
    order: [['createdAt', 'ASC']],
    attributes: ['current_stage', 'status', 'reassign_user_id', 'approved_by'],
    raw: true,
  })

  const userToStage = new Map(chain.map((c) => [String(c.user_id), c.stage_index]))
  let nextStage = 0
  let currentApproverUserId = chain[0] && chain[0].user_id ? String(chain[0].user_id) : null
  // When reassign happens: A2 reassigns to HOD. When HOD approves, go back to A2 (reassigner), skip A1.
  let reassignerToReturnTo = null

  for (const approval of approvals) {
    if (approval.current_stage !== nextStage) continue
    const statusLower = (approval.status || '').toLowerCase()
    if (statusLower === 'rejected' || statusLower === 'reject') {
      return {
        currentApproverUserId: null,
        currentStage: null,
        isRejected: true,
        isCompleted: false,
        allowedReassignUserIds: [],
      }
    }
    if (statusLower === 'reassigned' || statusLower === 'reassign') {
      currentApproverUserId = approval.reassign_user_id ? String(approval.reassign_user_id) : null
      const stage = approval.reassign_user_id
        ? userToStage.get(String(approval.reassign_user_id))
        : undefined
      if (stage !== undefined) nextStage = stage
      reassignerToReturnTo = approval.approved_by ? String(approval.approved_by) : null
      continue
    }
    if (statusLower === 'approved' || statusLower === 'approve') {
      if (reassignerToReturnTo) {
        currentApproverUserId = reassignerToReturnTo
        const stage = userToStage.get(reassignerToReturnTo)
        nextStage = stage !== undefined ? stage : nextStage + 1
        reassignerToReturnTo = null
      } else {
        nextStage++
        if (nextStage >= chain.length) {
          return {
            currentApproverUserId: null,
            currentStage: null,
            isRejected: false,
            isCompleted: true,
            allowedReassignUserIds: [],
          }
        }
        currentApproverUserId =
          chain[nextStage] && chain[nextStage].user_id ? String(chain[nextStage].user_id) : null
      }
    }
  }

  // Reassign only to previous approvers (stages 0..nextStage-1). HOD (stage 0) cannot reassign.
  const allowedReassignUserIds =
    nextStage > 0
      ? [
          ...new Set(
            chain
              .slice(0, nextStage)
              .map((c) => c.user_id)
              .filter(Boolean)
              .map(String),
          ),
        ]
      : []

  return {
    currentApproverUserId,
    currentStage: nextStage,
    isRejected: false,
    isCompleted: false,
    allowedReassignUserIds,
  }
}

// Update status of one assigned user. Body: { user_id, status }
export const updateAssignedUserStatusService = async (templateId, { user_id, status }) => {
  const template = await TemplateMasterModel.findByPk(templateId)
  if (!template) throw new NotFoundError('Template not found', 'updateAssignedUserStatusService()')
  const uid = (user_id || '').toString().trim()
  if (!uid) throw new BadRequestError('user_id is required', 'updateAssignedUserStatusService()')
  const st = ASSIGNED_USER_STATUS_ENUM.includes(status) ? status : null
  if (!st)
    throw new BadRequestError(
      `status must be one of: ${ASSIGNED_USER_STATUS_ENUM.join(', ')}`,
      'updateAssignedUserStatusService()',
    )

  const list = (template.assigned_users || []).map((a) => ({ ...a }))
  const i = list.findIndex((a) => a && a.user_id === uid)
  if (i < 0)
    throw new NotFoundError(
      'User is not assigned to this template',
      'updateAssignedUserStatusService()',
    )
  list[i].status = st
  await template.update({ assigned_users: list })
  return template
}

const workflowApprovalsInclude = {
  model: WorkflowApprovalModel,
  as: 'workflowApprovals',
  required: false,
  include: [
    {
      model: UserModel,
      as: 'user',
      attributes: ['_id', 'full_name', 'email', 'user_id'],
      required: false,
    },
  ],
}

export const GetTemplateAssignModuleService = async (userIds) => {
  const templates = await TemplateMasterModel.findAll({
    where: Sequelize.literal(`
      EXISTS (
        SELECT 1
        FROM OPENJSON(assigned_users)
        WITH (
          user_id NVARCHAR(100) '$.user_id'
        ) AS users
        WHERE users.user_id IN (${userIds.map((id) => `'${id}'`).join(',')})
      )
    `),
    include: [{ model: WorkflowModel, as: 'workflow' }],
  })

  const result = {}

  userIds.forEach((userId) => {
    result[userId] = []
  })

  templates.forEach((template) => {
    userIds.forEach((userId) => {
      const matchedUser = template.assigned_users.find((u) => u.user_id === userId)

      if (matchedUser) {
        result[userId].push({
          ...template.toJSON(),

          // ✅ ONLY ONE USER IN assigned_users
          assigned_users: [
            {
              user_id: matchedUser.user_id,
              status: matchedUser.status,
            },
          ],

          // optional shortcut
          user_status: matchedUser.status,
        })
      }
    })
  })

  return result
}

export const updateTemplateMasterWithWorkflow = async (id, data) => {
  const templates = await TemplateMasterModel.findByPk(id)
  if (!templates) {
    throw new NotFoundError('Template not found', 'updateTemplateMasterWithWorkflow()')
  }
  await templates.update(data)
}

export const testing = async (hodId) => {
  try {
    // 1️⃣ Get all users under HOD
    const users = await UserModel.findAll({
      where: { hod_id: hodId },
      attributes: ['_id', 'email', 'user_id', 'full_name'],
    })

    if (!users.length) return []

    // 2️⃣ Get all active templates
    const templates = await TemplateMasterModel.findAll({
      where: { is_active: true },
      include: [{ model: WorkflowModel, as: 'workflow' }],
    })

    // 3️⃣ Get all workflow approvals (only required fields)
    const approvals = await WorkflowApprovalModel.findAll({
      attributes: [
        '_id',
        'status',
        'current_stage',
        'reassign_stage',
        'workflow_id',
        'user_id',
        'template_id',
        'remarks',
        'approved_by',
        'createdAt',
      ],
    })

    // 4️⃣ Mapping
    const response = users.map((user) => {
      const userId = String(user._id)

      const userTemplates = templates
        .map((tpl) => {
          // check if user is assigned to this template
          let isAssigned = false

          // old single-user support
          if (tpl.assigned_user && String(tpl.assigned_user) === userId) {
            isAssigned = true
          }

          // new multi-user support
          const assignedUsers = tpl.assigned_users || []
          if (assignedUsers.some((u) => u.user_id === userId)) {
            isAssigned = true
          }

          if (!isAssigned) return null

          // workflow approvals for this user + template
          const tplApprovals = approvals.filter(
            (appr) =>
              String(appr.user_id) === userId && String(appr.template_id) === String(tpl._id),
          )

          // Extract HOD user ID from workflow
          let hodId = null
          const workflowData = tpl.workflow?.workflow || []
          if (Array.isArray(workflowData)) {
            const hodStage = workflowData.find(
              (stage) => stage.group === 'HOD' && stage.user && stage.user.trim() !== '',
            )
            if (hodStage && hodStage.user) {
              hodId = hodStage.user.trim()
            }
          }

          // Add workflow object with hod_id
          const workflowObj = tpl.workflow
            ? {
                ...(tpl.workflow.toJSON ? tpl.workflow.toJSON() : tpl.workflow),
                hod_id: hodId,
              }
            : null

          // Add is_approved_by_hod field to workflow approvals based on approved_by
          const enrichedApprovals = tplApprovals.map((appr) => {
            const approvalData = appr.toJSON ? appr.toJSON() : appr
            return {
              ...approvalData,
              is_approved_by_hod:
                hodId && approvalData.approved_by
                  ? String(approvalData.approved_by) === String(hodId)
                  : false,
            }
          })

          return {
            _id: tpl._id,
            template_name: tpl.template_name,
            template_type: tpl.template_type,
            workflow_id: tpl.workflow_id,
            is_active: tpl.is_active,
            assigned_status: assignedUsers.find((u) => u.user_id === userId)?.status ?? 'pending',
            workflow_approvals: enrichedApprovals,
            workflow: workflowObj,
          }
        })
        .filter(Boolean)

      return {
        _id: user._id,
        full_name: user.full_name,
        email: user.email,
        user_id: user.user_id,
        template_masters: userTemplates,
      }
    })

    return response
  } catch (error) {
    console.error('Testing API error:', error)
    throw error
  }
}

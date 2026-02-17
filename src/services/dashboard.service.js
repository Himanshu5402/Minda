import { Op, QueryTypes } from "sequelize";
import { sequelize } from "../sequelize.js";
import { AssemblyModal } from "../models/AssemblyLine.modal.js";
import { CheckListHistoryModal } from "../models/checkListHistory.modal.js";
import { CompanyModel } from "../models/company.modal.js";
import { PartModal } from "../models/Part.modal.js";
import { PlantModel } from "../models/plant.modal.js";
import { ProcessModel } from "../models/process.modal.js";
import { UserModel } from "../models/user.modal.js";


export const allCardsData = async (
    company = "",
    plant = "",
    startDate,
    endDate
) => {

     const hasDateFilter = Boolean(startDate && endDate);
 
    
     const normalizeStart = (date) => {
         const d = new Date(date);
         d.setHours(0, 0, 0, 0);
         return d;
     };
 
     const normalizeEnd = (date) => {
         const d = new Date(date);
         d.setHours(23, 59, 59, 999);
         return d;
     };
 
    
     const assemblyWhere = {
         ...(company && { company_id: company }),
         ...(plant && { plant_id: plant }),
     };
 
     const userWhere = {
         is_admin: false,
         ...(company && { employee_company: company }),
         ...(plant && { employee_plant: plant }),
     };
 
    
     const currentDateFilter = hasDateFilter
         ? {
             createdAt: {
                 [Op.gte]: normalizeStart(startDate),
                 [Op.lte]: normalizeEnd(endDate),
             },
         }
         : {};
 
    
     const [
         assembly_current,  
         employee_current,
         process_current,
         parts_current,
     ] = await Promise.all([
 
         AssemblyModal.count({
             where: {
                 ...assemblyWhere,
                 ...currentDateFilter,
             },
         }),
 
         UserModel.count({  
             where: {
                 ...userWhere,
                 ...currentDateFilter,
             },
         }),
 
         ProcessModel.count({
             distinct: true,
             col: "_id",
             include: [{
                 model: AssemblyModal,
                 as: "assemblies",
                 required: true,
                 where: {
                     ...assemblyWhere,
                     ...currentDateFilter,
                 },
             }],
         }),
 
         PartModal.count({
             where: currentDateFilter,
         })
     ]);
 
    
     if (!hasDateFilter) {
         return {
             totals: {
                 assembly: assembly_current,
                 employee: employee_current,
                 process: process_current,
                 parts: parts_current,
             },
             month_difference: {
                 assembly: 0,
                 employee: 0,
                 process: 0,
                 parts: 0,
             },
             period_difference: {
                 assembly: 0,
                 employee: 0,
                 process: 0,
                 parts: 0,
             },
         };
     }
 
    
     const currentStart = normalizeStart(startDate);
     const currentEnd = normalizeEnd(endDate);
 
     const lastStart = new Date(currentStart);
     lastStart.setMonth(lastStart.getMonth() - 1);
 
     const lastEnd = new Date(currentEnd);
     lastEnd.setMonth(lastEnd.getMonth() - 1);
 
     const lastDateFilter = {
         createdAt: {
             [Op.gte]: lastStart,
             [Op.lte]: lastEnd,
         },
     };
 
     const [
         assembly_last,
         employee_last,
         process_last,
         parts_last,
     ] = await Promise.all([
 
         AssemblyModal.count({
             where: {
                 ...assemblyWhere,
                 ...lastDateFilter,
             },
         }),
 
         UserModel.count({
             where: {
                 ...userWhere,
                 ...lastDateFilter,
             },
         }),
 
         ProcessModel.count({
             distinct: true,
             col: "_id",
             include: [{
                 model: AssemblyModal,
                 as: "assemblies",
                 required: true,
                 where: {
                     ...assemblyWhere,
                     ...lastDateFilter,
                 },
             }],
         }),
 
       PartModal.count({
             where: lastDateFilter
         })
     ]);
 
   
     const diff = {
         assembly: assembly_current - assembly_last,
         employee: employee_current - employee_last,
         process: process_current - process_last,
         parts: parts_current - parts_last,
     };
 
     return {
         totals: {
             assembly: assembly_current,
             employee: employee_current,
             process: process_current,
             parts: parts_current,
         },
         month_difference: diff,
         period_difference: diff,
     };
   
};



export const GetMonthlyTrend = async (admin, user) => { 
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    // 1️⃣ Fetch all assemblies
    const assemblies = await AssemblyModal.findAll({
        where: admin ? {} : { responsibility: user },
        attributes: ["_id", "createdAt"],
    });

    if (assemblies.length === 0) return [];

    const assemblyIds = assemblies.map(a => a._id);

    // 2️⃣ Fetch histories till today
    const histories = await CheckListHistoryModal.findAll({
        where: {
            assembly: { [Op.in]: assemblyIds },
            createdAt: { [Op.lte]: today }, // future blocked
        },
        attributes: ["assembly", "createdAt", "is_error", "is_resolved"],
    });

    // 3️⃣ Prepare monthly map
    const monthlyMap = new Map();

    // 4️⃣ Iterate assemblies
    for (const assembly of assemblies) {
        const assemblyCreated = new Date(assembly.createdAt);
        const startDate = new Date(assemblyCreated);
        startDate.setHours(0, 0, 0, 0);

        const endDate = today;

        // Loop day-wise
        for (
            let d = new Date(startDate);
            d <= endDate;
            d.setDate(d.getDate() + 1)
        ) {
            const year = d.getFullYear();
            const month = d.getMonth() + 1;
            const dayKey = `${year}-${month}-${d.getDate()}`; // day-level key

            if (!monthlyMap.has(dayKey)) {
                monthlyMap.set(dayKey, {
                    year,
                    month,
                    day: d.getDate(),
                    checkedAssemblies: new Set(),
                    errorAssemblies: new Set(),
                    resolvedAssemblies: new Set(),
                });
            }
        }
    }

    // 5️⃣ Process histories
    for (const h of histories) {
        const createdAt = new Date(h.createdAt);
        const year = createdAt.getFullYear();
        const month = createdAt.getMonth() + 1;
        const day = createdAt.getDate();
        const key = `${year}-${month}-${day}`;

        if (!monthlyMap.has(key)) continue; // safety

        const entry = monthlyMap.get(key);
        const assemblyId = h.assembly?.toString() || h.assembly;

        entry.checkedAssemblies.add(assemblyId);

        if (h.is_error) entry.errorAssemblies.add(assemblyId);
        if (h.is_resolved) entry.resolvedAssemblies.add(assemblyId);
    }

    // 6️⃣ Aggregate month-wise
    const monthAgg = new Map();

    for (const [, entry] of monthlyMap.entries()) {
        const monthKey = `${entry.year}-${entry.month}`;
        if (!monthAgg.has(monthKey)) {
            monthAgg.set(monthKey, {
                year: entry.year,
                month: entry.month,
                checked_count: 0,
                unchecked_count: 0,
                error_count: 0,
                resolved_count: 0,
            });
        }

        const agg = monthAgg.get(monthKey);

        agg.checked_count += entry.checkedAssemblies.size;
        agg.unchecked_count +=
            assemblyIds.length - entry.checkedAssemblies.size;
        agg.error_count += entry.errorAssemblies.size;
        agg.resolved_count += entry.resolvedAssemblies.size;
    }

    // 7️⃣ Convert to array & sort
    const monthly = Array.from(monthAgg.values());
    monthly.sort((a, b) => a.year - b.year || a.month - b.month);

    return monthly;
};




export const GetDailyAssemblyStatus = async (admin, user, date = new Date()) => {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const assemblies = await AssemblyModal.findAll({
        where: admin ? {} : { responsibility: user },
        include: [
            { model: CompanyModel, as: "company", attributes: ["_id", "company_name", "company_address"] },
            { model: PlantModel, as: "plant", attributes: ["_id", "plant_name", "plant_code","plant_address"] },
            { model: PartModal, as: "part", attributes: ["_id", "part_name", "part_number"] },
            { model: UserModel, as: "responsibleUser", attributes: ["_id", "full_name", "email", "user_id"] },
            {
                model: ProcessModel, as: "processes", attributes: ["_id"], through: { attributes: [] }
            },
        ],
        order: [["assembly_name", "ASC"]],
    });

    const assemblyJson = assemblies.map((a) => a.toJSON());
    const assemblyIds = assemblyJson.map((a) => a._id);

    const histories = assemblyIds.length
        ? await CheckListHistoryModal.findAll({
            where: {
                assembly: { [Op.in]: assemblyIds },
                createdAt: { [Op.between]: [startOfDay, endOfDay] },
            },
            attributes: ["assembly", "is_error"],
        })
        : [];

    const historyByAssembly = new Map();
    for (const h of histories) {
        const list = historyByAssembly.get(h.assembly) || [];
        list.push(h);
        historyByAssembly.set(h.assembly, list);
    }

    return assemblyJson.map((a) => {
        const checks = historyByAssembly.get(a._id) || [];
        const checked = checks.length > 0;
        const error = checks.some((c) => c.is_error === true);
        return {
            ...a,
            checked,
            unchecked: !checked,
            error,
        };
    });
};

export const GetMonthlyPerformance = async (admin, user, startDate, endDate) => {
    const assemblies = await AssemblyModal.findAll({
        where: admin ? {} : { responsibility: user },
        attributes: ["_id"],
    });
    const assemblyIds = assemblies.map((a) => a._id);
    if (assemblyIds.length === 0) return [];

    // Optional date range filter
    let rangeStart = null;
    let rangeEnd = null;
    if (startDate) {
        rangeStart = new Date(startDate);
        rangeStart.setHours(0, 0, 0, 0);
    }
    if (endDate) {
        rangeEnd = new Date(endDate);
        rangeEnd.setHours(23, 59, 59, 999);
    }

    let whereClause = `WHERE assembly IN (:assemblyIds)`;
    if (rangeStart) {
        whereClause += ` AND createdAt >= :startDate`;
    }
    if (rangeEnd) {
        whereClause += ` AND createdAt <= :endDate`;
    }

    const sql = `
        SELECT
            YEAR(createdAt) AS year,
            MONTH(createdAt) AS month,
            assembly AS assembly,
            MAX(CASE WHEN is_error = 1 THEN 1 ELSE 0 END) AS has_error
        FROM checklisthistories
        ${whereClause}
        GROUP BY YEAR(createdAt), MONTH(createdAt), assembly
        ORDER BY YEAR(createdAt), MONTH(createdAt)
    `;

    const replacements = {
        assemblyIds,
    };
    if (rangeStart) replacements.startDate = rangeStart;
    if (rangeEnd) replacements.endDate = rangeEnd;

    const perAssemblyMonth = await sequelize.query(sql, {
        replacements,
        type: QueryTypes.SELECT,
    });

    const monthMap = new Map();
    for (const row of perAssemblyMonth) {
        const key = `${row.year}-${row.month}`;
        const current = monthMap.get(key) || { year: Number(row.year), month: Number(row.month), running_count: 0, fault_count: 0, level: "assembly" };
        if (Number(row.has_error) === 1) current.fault_count += 1;
        else current.running_count += 1;
        monthMap.set(key, current);
    }

    return [...monthMap.values()].sort((a, b) => (a.year - b.year) || (a.month - b.month));
};

export const GetDailyErrorsAssembly = async (
    admin,
    user,
    startDate,
    endDate,
    company,
    plant
) => {
    const now = new Date();

    const startOfDay = startDate ? new Date(startDate) : new Date(now);
    startOfDay.setUTCHours(0, 0, 0, 0);

    const endOfDay = endDate ? new Date(endDate) : new Date(now);
    endOfDay.setUTCHours(23, 59, 59, 999);

    // 1️⃣ Assemblies (✅ company & plant filter added)
    const assemblies = await AssemblyModal.findAll({
        where: {
            ...(admin ? {} : { responsibility: user }),
            ...(company ? { company_id: company } : {}),
            ...(plant ? { plant_id: plant } : {}),
        },
        attributes: ["_id"],
    });

    const assemblyIds = assemblies.map(a => a._id);

    // 2️⃣ History
    const histories = assemblyIds.length
        ? await CheckListHistoryModal.findAll({
            where: {
                assembly: { [Op.in]: assemblyIds },
                createdAt: { [Op.between]: [startOfDay, endOfDay] },
            },
            attributes: [
                "assembly",
                "process_id",
                "is_error",
                "is_resolved",
            ],
        })
        : [];

    // 3️⃣ MAPS
    const assemblyMap = new Map();
    const processErrorCounts = new Map();

    for (const h of histories) {
        const a =
            assemblyMap.get(h.assembly) || {
                has_error: false,
                has_resolved_error: false,
            };

        // 🔴 ERROR
        if (h.is_error === true) {
            a.has_error = true;

            const count = processErrorCounts.get(h.process_id) || 0;
            processErrorCounts.set(h.process_id, count + 1);
        }

        // ✅ RESOLVED (same rule as AssemblyLineDataReport)
        if (h.is_resolved === true && h.is_error !== true) {
            a.has_resolved_error = true;
        }

        assemblyMap.set(h.assembly, a);
    }

    // 4️⃣ FINAL COUNTS
    let error_assemblies = 0;
    let still_error_assemblies = 0;
    let resolved_assemblies = 0;

    for (const id of assemblyIds) {
        const flags = assemblyMap.get(id);
        if (!flags?.has_error && !flags?.has_resolved_error) continue;

        if (flags.has_error) {
            error_assemblies++;
            still_error_assemblies++;
        } else if (flags.has_resolved_error) {
            resolved_assemblies++;
        }
    }

    // 5️⃣ TOP ERROR PROCESSES
    const topProcessIds = [...processErrorCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([pid]) => pid);

    const processes = topProcessIds.length
        ? await ProcessModel.findAll({
            where: { _id: { [Op.in]: topProcessIds } },
            attributes: ["_id", "process_name"],
        })
        : [];

    const nameById = new Map(
        processes.map(p => [p._id, p.process_name])
    );

    const top_error_processes = topProcessIds.map(pid => ({
        process_id: pid,
        process_name: nameById.get(pid) || null,
        error_count: processErrorCounts.get(pid) || 0,
    }));

    return {
        assembly_summary: {
            error_assemblies,
            still_error_assemblies,
            resolved_assemblies,
        },
        top_error_processes,
    };
};
























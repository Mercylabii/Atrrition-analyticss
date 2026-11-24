import React from 'react';
import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import type { FilterState, WorkspacePayload } from '../shared/types.ts';

interface FilterBarProps {
  filters: FilterState;
  options: WorkspacePayload['options'];
  minHireDate: string;
  maxHireDate: string;
  filteredCount: number;
  totalCount: number;
  onChange: (next: FilterState) => void;
  onReset: () => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  options,
  minHireDate,
  maxHireDate,
  filteredCount,
  totalCount,
  onChange,
  onReset,
}) => {
  const availableRoles =
    filters.department !== 'All' && options.rolesByDepartment[filters.department]
      ? options.rolesByDepartment[filters.department]
      : options.jobRoles;

  const availableManagers =
    filters.department !== 'All' && options.managersByDepartment[filters.department]
      ? options.managersByDepartment[filters.department]
      : options.managers;

  const activeFilterCount = [
    filters.department !== 'All',
    filters.jobRole !== 'All',
    filters.employmentType !== 'All',
    filters.gender !== 'All',
    filters.manager !== 'All',
    Boolean(filters.hireStartDate && filters.hireStartDate !== minHireDate),
    Boolean(filters.hireEndDate && filters.hireEndDate !== maxHireDate),
  ].filter(Boolean).length;

  const update = (patch: Partial<FilterState>) => {
    const next = { ...filters, ...patch };
    if (patch.department && patch.department !== filters.department) {
      const validRoles = options.rolesByDepartment[patch.department] ?? options.jobRoles;
      if (next.jobRole !== 'All' && !validRoles.includes(next.jobRole)) {
        next.jobRole = 'All';
      }
      const validMgrs = options.managersByDepartment[patch.department] ?? options.managers;
      if (next.manager !== 'All' && !validMgrs.includes(next.manager)) {
        next.manager = 'All';
      }
    }
    onChange(next);
  };

  return (
    <section
      aria-label="Workforce Filters"
      className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/90 dark:border-zinc-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)] p-4 transition-colors"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
          <SlidersHorizontal className="h-3.5 w-3.5 text-[#6D132B] dark:text-rose-400" />
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">Workforce Filters</span>
          <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">·</span>
          <span className="tabular-nums">
            Showing <strong className="text-zinc-900 dark:text-zinc-100 font-semibold">{filteredCount}</strong> of{' '}
            {totalCount} employees
          </span>
          {activeFilterCount > 0 && (
            <>
              <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">·</span>
              <span className="text-[#6D132B] dark:text-rose-400 font-medium tabular-nums">
                {activeFilterCount} active
              </span>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={onReset}
          disabled={activeFilterCount === 0}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap shrink-0"
        >
          <RotateCcw className="h-3 w-3" />
          Reset Filters
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-2.5">
        <div>
          <label htmlFor="flt-dept" className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">
            Department
          </label>
          <select
            id="flt-dept"
            value={filters.department}
            onChange={(e) => update({ department: e.target.value })}
            className="w-full h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/80 px-2.5 text-xs text-zinc-900 dark:text-zinc-100 focus:border-[#6D132B] dark:focus:border-rose-400 focus:bg-white dark:focus:bg-zinc-800 focus:outline-none"
          >
            <option value="All">All Departments</option>
            {options.departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="flt-role" className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">
            Job Role
          </label>
          <select
            id="flt-role"
            value={filters.jobRole}
            onChange={(e) => update({ jobRole: e.target.value })}
            className="w-full h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/80 px-2.5 text-xs text-zinc-900 dark:text-zinc-100 focus:border-[#6D132B] dark:focus:border-rose-400 focus:bg-white dark:focus:bg-zinc-800 focus:outline-none"
          >
            <option value="All">All Roles</option>
            {availableRoles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="flt-type" className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">
            Employment Type
          </label>
          <select
            id="flt-type"
            value={filters.employmentType}
            onChange={(e) => update({ employmentType: e.target.value })}
            className="w-full h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/80 px-2.5 text-xs text-zinc-900 dark:text-zinc-100 focus:border-[#6D132B] dark:focus:border-rose-400 focus:bg-white dark:focus:bg-zinc-800 focus:outline-none"
          >
            <option value="All">All Types</option>
            {options.employmentTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="flt-gender" className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">
            Gender
          </label>
          <select
            id="flt-gender"
            value={filters.gender}
            onChange={(e) => update({ gender: e.target.value })}
            className="w-full h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/80 px-2.5 text-xs text-zinc-900 dark:text-zinc-100 focus:border-[#6D132B] dark:focus:border-rose-400 focus:bg-white dark:focus:bg-zinc-800 focus:outline-none"
          >
            <option value="All">All Genders</option>
            {options.genders.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="flt-mgr" className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">
            Manager
          </label>
          <select
            id="flt-mgr"
            value={filters.manager}
            onChange={(e) => update({ manager: e.target.value })}
            className="w-full h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/80 px-2.5 text-xs text-zinc-900 dark:text-zinc-100 focus:border-[#6D132B] dark:focus:border-rose-400 focus:bg-white dark:focus:bg-zinc-800 focus:outline-none"
          >
            <option value="All">All Managers</option>
            {availableManagers.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="flt-start" className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">
            Hire Date From
          </label>
          <input
            id="flt-start"
            type="date"
            value={filters.hireStartDate}
            min={minHireDate}
            max={filters.hireEndDate || maxHireDate}
            onChange={(e) => update({ hireStartDate: e.target.value })}
            className="w-full h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/80 px-2.5 text-xs text-zinc-900 dark:text-zinc-100 tabular-nums focus:border-[#6D132B] dark:focus:border-rose-400 focus:bg-white dark:focus:bg-zinc-800 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="flt-end" className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">
            Hire Date To
          </label>
          <input
            id="flt-end"
            type="date"
            value={filters.hireEndDate}
            min={filters.hireStartDate || minHireDate}
            max={maxHireDate}
            onChange={(e) => update({ hireEndDate: e.target.value })}
            className="w-full h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/80 px-2.5 text-xs text-zinc-900 dark:text-zinc-100 tabular-nums focus:border-[#6D132B] dark:focus:border-rose-400 focus:bg-white dark:focus:bg-zinc-800 focus:outline-none"
          />
        </div>
      </div>
    </section>
  );
};

import type { CompanyInfo } from '../lib/api';

interface CompanyPickerProps {
  companies: CompanyInfo[];
  selectedCompanyId: string;
  onSelect: (companyId: string) => void;
}

export default function CompanyPicker({ companies, selectedCompanyId, onSelect }: CompanyPickerProps) {
  if (companies.length <= 1) return null;
  return (
    <div className="mb-6">
      <label className="block text-sm font-semibold" htmlFor="company-picker">Company</label>
      <select id="company-picker" value={selectedCompanyId} onChange={(e) => onSelect(e.target.value)} className="mt-1 w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]">
        {companies.map((company) => (
          <option key={company.id} value={company.id}>{company.name} ({company.role})</option>
        ))}
      </select>
    </div>
  );
}

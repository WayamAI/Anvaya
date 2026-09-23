import { Building, MapPin } from "lucide-react";
import { useTheme } from "next-themes";
import anvayaLogoLight from "@/assets/anvaya-logo-light.svg";
import anvayaLogoDark from "@/assets/anvaya-logo-dark.svg";
import { PageIcon } from "@/components/app/page-icon";

const company = {
  name: "Anvaya Manufacturing Pvt. Ltd.",
  gst: "27AABCM1234F1Z5",
  pan: "AABCM1234F",
  cin: "U24100MH2018PTC123456",
  address: "Plot 42, MIDC Industrial Area, Hinjewadi Phase 3, Pune 411057",
  phone: "+91 20 6789 0123",
  email: "operations@anvaya.in",
};

const warehouses = [
  { name: "Pune Plant", code: "WH-PUN", type: "Manufacturing", address: "Plot 42, MIDC Hinjewadi, Pune 411057", manager: "Rajesh Kumar", skus: 1247, area: "45,000 sq ft", status: "Active" },
  { name: "Mumbai Warehouse", code: "WH-MUM", type: "Distribution", address: "Unit 12, Bhiwandi Logistics Park, Mumbai 421302", manager: "Vikram Thakur", skus: 842, area: "28,000 sq ft", status: "Active" },
  { name: "Delhi Depot", code: "WH-DEL", type: "Distribution", address: "Plot 8, Kundli Industrial Area, Sonipat 131028", manager: "Arun Mehra", skus: 620, area: "18,000 sq ft", status: "Active" },
  { name: "Chennai Hub", code: "WH-CHE", type: "Distribution", address: "Unit 5, Ambattur Industrial Estate, Chennai 600058", manager: "Karthik Rajan", skus: 580, area: "15,000 sq ft", status: "Active" },
];

export default function CompanySettings() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const anvayaLogo = (isDark ? anvayaLogoDark : anvayaLogoLight).src;

  return (
    <div className="px-6 py-5 space-y-6">
      <h1 className="flex items-center gap-2.5 font-display text-display-page text-foreground">
          <PageIcon />
          <span className="min-w-0">Company & warehouses</span>
        </h1>

      {/* Company Info with Logo */}
      <div className="p-6">
        <div className="flex items-start gap-4">
          <img src={anvayaLogo} alt="Anvaya" className="w-12 h-12 object-contain flex-shrink-0" />
          <div className="flex-1">
            <h3 className="text-body-lg font-semibold">{company.name}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4 text-body-md">
              <div><span className="text-muted-foreground">GSTIN:</span><br /><span className="font-medium identifier">{company.gst}</span></div>
              <div><span className="text-muted-foreground">PAN:</span><br /><span className="font-medium identifier">{company.pan}</span></div>
              <div><span className="text-muted-foreground">CIN:</span><br /><span className="font-medium identifier">{company.cin}</span></div>
              <div><span className="text-muted-foreground">Address:</span><br /><span className="font-medium">{company.address}</span></div>
              <div><span className="text-muted-foreground">Phone:</span><br /><span className="font-medium">{company.phone}</span></div>
              <div><span className="text-muted-foreground">Email:</span><br /><span className="font-medium">{company.email}</span></div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="label-caps">Warehouses & plants</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {warehouses.map((w, i) => (
            <div key={i}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-body-md font-semibold">{w.name}</h4>
                    <span className="text-caption identifier bg-secondary px-1.5 py-0.5 rounded">{w.code}</span>
                  </div>
                  <span className="text-body-sm text-muted-foreground">{w.type}</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-body-sm">
                    <div><span className="text-muted-foreground">Manager:</span> <span className="font-medium">{w.manager}</span></div>
                    <div><span className="text-muted-foreground">SKUs:</span> <span className="font-medium tabular-nums">{w.skus}</span></div>
                    <div><span className="text-muted-foreground">Area:</span> <span className="font-medium">{w.area}</span></div>
                    <div><span className="text-muted-foreground">Status:</span> <span className="font-medium text-success">{w.status}</span></div>
                  </div>
                  <p className="text-body-sm text-muted-foreground mt-2">{w.address}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

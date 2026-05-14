# TankPos Reports & Freight Map Features

## Overview

Two new tabs have been added to your tanker shipping intelligence application:

1. **Reports Tab** - Broker market reports with freight rates, fixtures, and market commentary
2. **Freight Map Tab** - Interactive world map for tracking freight rates across global routes

---

## 1. Reports Tab 📋

### Features

- **Multiple Report Types:**
  - Intermediate (European short-haul routes)
  - Asia to Europe (long-haul routes)
  - Transatlantic (US-Europe routes)
  - TimeCharter (period charter rates)

- **Rate Grid:** Dynamic freight rate tables that adapt based on report type
- **TCE Earnings:** Indicative Time Charter Equivalent earnings calculator
- **Market Commentary:** Rich text area for market analysis and outlook
- **Recent Fixtures:** Table of completed vessel fixtures with details
- **Market Quotes:** Current market quotes with basis information
- **Export to Report:** Select vessels/cargoes from Positions or Cargoes tabs and click "📋 Export to Report" button

### Report Components

Each report includes:
- Professional header with report type and date
- Freight rate grid (customizable per report type)
- TCE earnings indicators by vessel segment
- Market commentary section
- Recent fixtures table
- Market quotes table
- Footer with disclaimer

### Workflow

1. **Select vessels/cargoes** in Positions or Cargoes tab (use checkboxes)
2. **Click "📋 Export to Report"** button
3. Navigate to Reports tab (or it will switch automatically)
4. **Choose report type** from dropdown
5. **Fill in rates** in the grid (varies by report type)
6. **Add TCE earnings** for different vessel segments
7. **Write market commentary** in the text area
8. **Add fixtures** - Click "+ Add" and fill in vessel, charterer, route, qty, rate
9. **Add quotes** - Click "+ Add" and fill in route, size, rate, basis
10. **Save report** - Click "💾 Save" to store in database
11. **Export:**
   - **🖨️ Print** - Opens browser print dialog
   - **📸 Copy** - Copy as screenshot (requires html2canvas library)

### Report History

- **Saved Reports** panel on left side shows all previously saved reports
- Click any saved report to load it
- Reports are sorted by creation date (newest first)
- Each report card shows: type, report date, and creation timestamp

---

## 2. Freight Map Tab 🌍

### Features

- **Interactive World Map:** Visual representation of global freight routes
- **24 Pre-configured Routes:**
  - Transatlantic: ARA-US, US-ARA, ARA-Caribs
  - Intermediate: ARA-Thames, WCUK-ARA, Mongstad-ARA, ARA-Gothenburg, etc.
  - Mediterranean: ARA-WMed, ARA-CMed, Black Sea-ARA, etc.
  - Long Haul: ARA-Far East, Singapore-ARA, China-ARA, ARA-Red Sea, etc.

- **Rate Tracking:**
  - Add current rates to any route
  - View historical rate data
  - See last update date on each route
  - Track rate trends over time

- **Market Strength Indicators:**
  - **Green** = Strong market (+5% vs. recent average)
  - **Amber** = Neutral market (±5%)
  - **Red** = Weak market (-5% vs. recent average)

### Map Controls

- **🔍 Zoom In/Out** - Adjust map zoom level
- **Reset** - Return to default view
- **⚙️ Settings** - Show/hide route management panel

### Workflow

1. **Select a route** by clicking on the map (click near the route line/arrow)
2. **Enter rate** in the text box (WS or $/day)
3. **Click "Add Rate"** to save
4. **View recent rates** for the selected route in the panel
5. **Track history** in the Rate History section below the map

### Region Filtering

Use the region dropdown to filter routes:
- All (show everything)
- Intermediate (short-haul European)
- Transatlantic (US-Europe)
- Med (Mediterranean)
- Long Haul (Asia, Africa, etc.)

### Route Management (Settings Panel)

- **+ Add Custom Route** - Create your own routes
- **View all routes** - See complete list
- **Delete custom routes** - Remove routes you've added (default routes cannot be deleted)

### Rate History Table

Below the map, rates are organized by region showing:
- Route name
- Current rate (color-coded by market strength)
- Date added
- Historical context

### Market Analysis

The map automatically:
- Calculates market strength based on recent rate changes
- Color-codes routes (green/amber/red)
- Shows trends in the rate history grid
- Helps identify strong/weak trade routes at a glance

---

## Database Setup

Run the following SQL in your Supabase SQL Editor:

```sql
-- Reports table
CREATE TABLE IF NOT EXISTS reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_type TEXT NOT NULL,
  report_date DATE NOT NULL,
  commentary TEXT,
  rate_grid JSONB,
  tce_earnings JSONB,
  fixtures JSONB,
  quotes JSONB,
  selected_vessels TEXT[],
  selected_cargoes TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Freight rates table
CREATE TABLE IF NOT EXISTS freight_rates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  route_id TEXT NOT NULL,
  route_label TEXT NOT NULL,
  rate TEXT NOT NULL,
  region TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(report_type);
CREATE INDEX IF NOT EXISTS idx_reports_date ON reports(report_date);
CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at);
CREATE INDEX IF NOT EXISTS idx_freight_route ON freight_rates(route_id);
CREATE INDEX IF NOT EXISTS idx_freight_region ON freight_rates(region);
CREATE INDEX IF NOT EXISTS idx_freight_created ON freight_rates(created_at);

-- Enable RLS
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE freight_rates ENABLE ROW LEVEL SECURITY;

-- Basic policies (adjust for your auth setup)
CREATE POLICY "Allow all operations on reports" ON reports
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on freight_rates" ON freight_rates
  FOR ALL USING (true) WITH CHECK (true);
```

---

## File Structure

New files added:
```
src/
├── ReportsTab.jsx          # Reports component
├── FreightMapTab.jsx       # Freight map component
└── DesktopApp__1_.jsx      # Updated with new tabs
```

Database schema:
```
supabase_schema.sql         # SQL for creating tables
```

---

## Usage Tips

### Reports
- Save reports regularly to track market changes over time
- Use consistent naming in commentary for easier searching later
- TCE earnings are indicative - adjust based on your assumptions
- Print reports to PDF for email distribution
- Copy as screenshot for WhatsApp sharing

### Freight Map
- Add rates daily to build historical database
- Use region filters to focus on specific markets
- Watch color changes to spot market trends
- Compare routes within same region to find arbitrage opportunities
- Custom routes useful for client-specific trading patterns

---

## Future Enhancements (Optional)

### Reports
- [ ] Email integration for direct sending
- [ ] PDF export with company branding
- [ ] Charts/graphs for rate trends
- [ ] Comparison with previous reports
- [ ] Template library for different clients

### Freight Map
- [ ] Real-time AIS integration
- [ ] Weather overlays
- [ ] Canal status indicators
- [ ] Port congestion data
- [ ] Predicted rates based on ML
- [ ] Export map as PNG/PDF
- [ ] 3D globe view option

---

## Troubleshooting

**Reports not saving:**
- Check Supabase connection in browser console
- Verify RLS policies are set correctly
- Ensure `reports` table exists

**Map not displaying routes:**
- Check if `freight_rates` table is accessible
- Verify coordinates in DEFAULT_ROUTES array
- Check browser console for errors

**Export buttons not visible:**
- Select at least one vessel/cargo using checkboxes
- Button only appears when items are selected
- Check if tab state is updating correctly

---

## Dependencies

Required packages (already in your project):
- `react` - UI framework
- `@supabase/supabase-js` - Database client
- Standard browser APIs for print functionality

Optional (for enhanced features):
- `html2canvas` - For screenshot/image export
- `jspdf` - For PDF generation
- Chart libraries (Chart.js, Recharts) for visualizations

---

## Support

For issues or questions:
1. Check browser console for errors
2. Verify Supabase table structure matches schema
3. Ensure environment variables are set correctly
4. Review component props being passed from DesktopApp

---

## Deployment Notes

When deploying to Vercel:
1. Ensure Supabase environment variables are set in Vercel dashboard
2. Run the SQL schema in Supabase before first use
3. Test print functionality in production (some features vary by browser)
4. Consider adding user authentication if sharing with multiple users

---

## Integration Points

The new tabs integrate with existing features:

**From Positions Tab:**
- Select vessels → Export to Report → Pre-populate report data
- Vessel selection persists across tab switches

**From Cargoes Tab:**
- Select cargoes → Export to Report → Include in fixtures
- Cargo status colors match existing system

**Consistent Styling:**
- Uses `constants.js` color palette (C.bg, C.blue, etc.)
- Matches existing table and button styles
- Responsive design for mobile/desktop

**Data Sharing:**
- Selected vessels/cargoes passed as props to ReportsTab
- All tabs share same Supabase client
- Global state managed through DesktopApp parent component

---

## Performance Considerations

- Reports tab loads saved reports on mount (lazy loaded)
- Freight map uses SVG for smooth scaling and performance
- Rate history limited to recent entries per route to avoid slowdowns
- Table pagination maintains performance with large datasets
- Map routes pre-configured (not fetched) for instant load

---

Enjoy your new broker reporting and freight tracking capabilities! 🚢📊🌍

import React, { useState, useMemo } from "react";

// Signal Ocean-inspired theme
const THEME = {
  bg: "#0a1628",
  bg2: "#0f1d2e", 
  bg3: "#1a2942",
  bd: "#2a3f5f",
  bd2: "#1e3048",
  tx: "#e3e8ef",
  dim: "#8b9cb5",
  faint: "#6b7f9a",
  blue: "#00d4ff",
  cyan: "#0ea5e9",
  orange: "#ff6b35",
  green: "#43e97b",
  amber: "#ffb020",
  purple: "#a78bfa",
  red: "#f87171"
};

function ProjectsTab() {
  const [activeCalc, setActiveCalc] = useState("spot-vs-tc");

  const calculators = [
    { id: "spot-vs-tc", label: "Spot TCE vs TC Hire", icon: "⚖️" },
    { id: "vessel-purchase", label: "Vessel Purchase ROI", icon: "🚢" },
    { id: "bareboat", label: "Bareboat Charter (BBC)", icon: "📊" },
    { id: "spot-vs-tc-charterer", label: "Spot vs TC (Charterer)", icon: "📋" }
  ];

  return (
    <div style={{ minHeight: "calc(100vh - 100px)", display: "flex", flexDirection: "column", background: THEME.bg }}>
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid " + THEME.bd2, display: "flex", alignItems: "center", gap: 12, background: THEME.bg2 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: THEME.tx, letterSpacing: "-0.02em" }}>🧮 Project Calculators</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {calculators.map(calc => (
            <button
              key={calc.id}
              onClick={() => setActiveCalc(calc.id)}
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: "7px 14px",
                borderRadius: 6,
                border: "1px solid " + (activeCalc === calc.id ? THEME.blue : THEME.bd2),
                background: activeCalc === calc.id ? THEME.blue + "22" : THEME.bg3,
                color: activeCalc === calc.id ? THEME.blue : THEME.dim,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 0.2s"
              }}
            >
              {calc.icon} {calc.label}
            </button>
          ))}
        </div>
      </div>

      {/* Calculator Content */}
      <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
        {activeCalc === "spot-vs-tc" && <SpotVsTCCalculator />}
        {activeCalc === "vessel-purchase" && <VesselPurchaseCalculator />}
        {activeCalc === "bareboat" && <BareboatCalculator />}
        {activeCalc === "spot-vs-tc-charterer" && <SpotVsTCChartererCalculator />}
      </div>
    </div>
  );
}

// ===== SPOT VS TC CALCULATOR =====
function SpotVsTCCalculator() {
  const [inputs, setInputs] = useState({
    cargoQty: "38000",
    cargoGrade: "CPP",
    loadPort: "Tees",
    dischPort: "ARA",
    distance: "650",
    spotFreight: "360000",
    demurrageRate: "35000",
    demurrageDays: "0.5",
    tcHire: "20000",
    seaDays: "3",
    portDays: "4",
    bunkersPrice: "550",
    seaConsumption: "28",
    portConsumption: "4",
    portCost: "45000",
    commission: "1.25",
    vesselSize: "MR"
  });

  const update = (key, val) => setInputs(prev => ({ ...prev, [key]: val }));

  const results = useMemo(() => {
    const freight = parseFloat(inputs.spotFreight) || 0;
    const demRate = parseFloat(inputs.demurrageRate) || 0;
    const demDays = parseFloat(inputs.demurrageDays) || 0;
    const comm = parseFloat(inputs.commission) || 0;

    const spotCost = freight + (demRate * demDays);
    const spotCommission = spotCost * (comm / 100);
    const spotTotal = spotCost + spotCommission;

    const hire = parseFloat(inputs.tcHire) || 0;
    const seaDays = parseFloat(inputs.seaDays) || 0;
    const portDays = parseFloat(inputs.portDays) || 0;
    const totalDays = seaDays + portDays;
    const bunkersPrice = parseFloat(inputs.bunkersPrice) || 0;
    const seaCons = parseFloat(inputs.seaConsumption) || 0;
    const portCons = parseFloat(inputs.portConsumption) || 0;
    const portCost = parseFloat(inputs.portCost) || 0;

    const hireCost = hire * totalDays;
    const bunkersCost = (seaCons * seaDays + portCons * portDays) * bunkersPrice;
    const tcTotal = hireCost + bunkersCost + portCost;

    const saving = spotTotal - tcTotal;
    const savingPct = spotTotal > 0 ? (saving / spotTotal) * 100 : 0;

    return { spotTotal, tcTotal, saving, savingPct, totalDays };
  }, [inputs]);

  const inpS = { background: THEME.bg3, border: "1px solid " + THEME.bd, borderRadius: 4, color: THEME.tx, fontFamily: "inherit", fontSize: 13, padding: "7px 10px", outline: "none", width: "100%" };
  const lblS = { fontSize: 10, color: THEME.faint, marginBottom: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" };
  const cardS = { background: THEME.bg2, border: "1px solid " + THEME.bd, borderRadius: 8, padding: 16 };
  const headS = { fontSize: 13, fontWeight: 700, color: THEME.tx, marginBottom: 14, paddingBottom: 10, borderBottom: "1px solid " + THEME.bd2, letterSpacing: "-0.01em" };

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: THEME.tx, margin: "0 0 8px 0", letterSpacing: "-0.02em" }}>Spot vs Time Charter Analysis</h3>
        <p style={{ fontSize: 13, color: THEME.faint, margin: 0 }}>Compare the cost of chartering a vessel on spot vs. time charter for a specific voyage</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        {/* Voyage Details */}
        <div style={cardS}>
          <div style={headS}>⛴️ Voyage Details</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div style={lblS}>Vessel Size</div>
              <input style={inpS} value={inputs.vesselSize} onChange={e => update("vesselSize", e.target.value)} placeholder="MR / LR1 / LR2" />
            </div>
            <div>
              <div style={lblS}>Cargo Qty (MT)</div>
              <input style={inpS} value={inputs.cargoQty} onChange={e => update("cargoQty", e.target.value)} />
            </div>
            <div>
              <div style={lblS}>Cargo Grade</div>
              <input style={inpS} value={inputs.cargoGrade} onChange={e => update("cargoGrade", e.target.value)} placeholder="CPP / UNL / Gasoil" />
            </div>
            <div>
              <div style={lblS}>Load Port</div>
              <input style={inpS} value={inputs.loadPort} onChange={e => update("loadPort", e.target.value)} />
            </div>
            <div>
              <div style={lblS}>Discharge Port</div>
              <input style={inpS} value={inputs.dischPort} onChange={e => update("dischPort", e.target.value)} />
            </div>
            <div>
              <div style={lblS}>Distance (nm)</div>
              <input style={inpS} value={inputs.distance} onChange={e => update("distance", e.target.value)} />
            </div>
            <div>
              <div style={lblS}>Commission (%)</div>
              <input style={inpS} value={inputs.commission} onChange={e => update("commission", e.target.value)} />
            </div>
          </div>
        </div>

        {/* Spot Option */}
        <div style={cardS}>
          <div style={headS}>📍 Spot Freight</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div style={lblS}>Spot Freight ($)</div>
              <input style={inpS} value={inputs.spotFreight} onChange={e => update("spotFreight", e.target.value)} />
            </div>
            <div>
              <div style={lblS}>Demurrage Rate ($/day)</div>
              <input style={inpS} value={inputs.demurrageRate} onChange={e => update("demurrageRate", e.target.value)} />
            </div>
            <div>
              <div style={lblS}>Demurrage Days</div>
              <input style={inpS} value={inputs.demurrageDays} onChange={e => update("demurrageDays", e.target.value)} />
            </div>
            <div style={{ marginTop: 20, padding: 14, background: THEME.bg3, borderRadius: 6, border: "1px solid " + THEME.bd2 }}>
              <div style={{ fontSize: 11, color: THEME.faint, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Spot Total</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: THEME.blue, letterSpacing: "-0.02em" }}>${results.spotTotal.toLocaleString()}</div>
              <div style={{ fontSize: 10, color: THEME.faint, marginTop: 4 }}>Freight + Demurrage + Commission</div>
            </div>
          </div>
        </div>

        {/* TC Option */}
        <div style={cardS}>
          <div style={headS}>⏱️ Time Charter</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div style={lblS}>TC Hire ($/day)</div>
              <input style={inpS} value={inputs.tcHire} onChange={e => update("tcHire", e.target.value)} />
            </div>
            <div>
              <div style={lblS}>Sea Days</div>
              <input style={inpS} value={inputs.seaDays} onChange={e => update("seaDays", e.target.value)} />
            </div>
            <div>
              <div style={lblS}>Port Days</div>
              <input style={inpS} value={inputs.portDays} onChange={e => update("portDays", e.target.value)} />
            </div>
            <div>
              <div style={lblS}>Bunkers Price ($/mt)</div>
              <input style={inpS} value={inputs.bunkersPrice} onChange={e => update("bunkersPrice", e.target.value)} />
            </div>
            <div>
              <div style={lblS}>Sea Consumption (mt/day)</div>
              <input style={inpS} value={inputs.seaConsumption} onChange={e => update("seaConsumption", e.target.value)} />
            </div>
            <div>
              <div style={lblS}>Port Consumption (mt/day)</div>
              <input style={inpS} value={inputs.portConsumption} onChange={e => update("portConsumption", e.target.value)} />
            </div>
            <div>
              <div style={lblS}>Port Costs ($)</div>
              <input style={inpS} value={inputs.portCost} onChange={e => update("portCost", e.target.value)} />
            </div>
            <div style={{ marginTop: 8, padding: 14, background: THEME.bg3, borderRadius: 6, border: "1px solid " + THEME.bd2 }}>
              <div style={{ fontSize: 11, color: THEME.faint, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>TC Total</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: THEME.amber, letterSpacing: "-0.02em" }}>${results.tcTotal.toLocaleString()}</div>
              <div style={{ fontSize: 10, color: THEME.faint, marginTop: 4 }}>{results.totalDays} days · Hire + Bunkers + Ports</div>
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      <div style={{ marginTop: 20, padding: 20, background: results.saving > 0 ? THEME.green + "11" : THEME.red + "11", border: "1px solid " + (results.saving > 0 ? THEME.green + "44" : THEME.red + "44"), borderRadius: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13, color: THEME.faint, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>
              {results.saving > 0 ? "💰 TC is cheaper by" : "📉 Spot is cheaper by"}
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: results.saving > 0 ? THEME.green : THEME.red, letterSpacing: "-0.03em" }}>
              ${Math.abs(results.saving).toLocaleString()}
            </div>
            <div style={{ fontSize: 14, color: THEME.faint, marginTop: 4 }}>
              {Math.abs(results.savingPct).toFixed(1)}% {results.saving > 0 ? "saving" : "premium"}
            </div>
          </div>
          <div style={{ fontSize: 48, opacity: 0.3 }}>
            {results.saving > 0 ? "✓" : "✕"}
          </div>
        </div>
      </div>
    </div>
  );
}

// Placeholder components for other calculators
function VesselPurchaseCalculator() {
  return (
    <div style={{ padding: 40, textAlign: "center", color: THEME.faint }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: THEME.tx, marginBottom: 12 }}>🚢 Vessel Purchase ROI Calculator</div>
      <div>Coming soon...</div>
    </div>
  );
}

function BareboatCalculator() {
  return (
    <div style={{ padding: 40, textAlign: "center", color: THEME.faint }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: THEME.tx, marginBottom: 12 }}>📊 Bareboat Charter Calculator</div>
      <div>Coming soon...</div>
    </div>
  );
}

function SpotVsTCChartererCalculator() {
  return (
    <div style={{ padding: 40, textAlign: "center", color: THEME.faint }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: THEME.tx, marginBottom: 12 }}>📋 Spot vs TC (Charterer View)</div>
      <div>Coming soon...</div>
    </div>
  );
}

export default ProjectsTab;

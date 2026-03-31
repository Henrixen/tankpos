import React, { useState, useMemo } from "react";
import { C } from "./constants";

function ProjectsTab() {
  const [activeCalc, setActiveCalc] = useState("spot-vs-tc");

  const calculators = [
    { id: "spot-vs-tc", label: "Spot vs TC Analysis", icon: "⚖️" },
    { id: "vessel-purchase", label: "Vessel Purchase ROI", icon: "🚢" },
    { id: "bareboat", label: "Bareboat Charter (BBC)", icon: "📊" }
  ];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: C.bg1 }}>
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid " + C.bd, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: C.tx }}>Project Calculators</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {calculators.map(calc => (
            <button
              key={calc.id}
              onClick={() => setActiveCalc(calc.id)}
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid " + (activeCalc === calc.id ? C.blue : C.bd),
                background: activeCalc === calc.id ? C.blue + "22" : "transparent",
                color: activeCalc === calc.id ? C.blue : C.dim,
                cursor: "pointer",
                fontFamily: "inherit"
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
      </div>
    </div>
  );
}

// ===== SPOT VS TC CALCULATOR =====
function SpotVsTCCalculator() {
  const [inputs, setInputs] = useState({
    // Voyage details
    cargoQty: "38000",
    cargoGrade: "CPP",
    loadPort: "Tees",
    dischPort: "ARA",
    distance: "650",
    // Spot option
    spotFreight: "360000",
    demurrageRate: "35000",
    demurrageDays: "0.5",
    // TC option
    tcHire: "20000",
    seaDays: "3",
    portDays: "4",
    bunkersPrice: "550",
    seaConsumption: "28",
    portConsumption: "4",
    portCost: "45000",
    // Common
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

  const inpS = { background: C.bg3, border: "1px solid " + C.bd, borderRadius: 4, color: C.tx, fontFamily: "inherit", fontSize: 13, padding: "6px 10px", outline: "none", width: "100%" };
  const lblS = { fontSize: 11, color: C.faint, marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" };

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: C.tx, margin: "0 0 8px 0" }}>Spot vs Time Charter Analysis</h3>
        <p style={{ fontSize: 13, color: C.faint, margin: 0 }}>Compare the cost of chartering a vessel on spot vs. time charter for a specific voyage</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
        {/* Voyage Details */}
        <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid " + C.bd2 }}>Voyage Details</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
        <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid " + C.bd2 }}>💰 Spot Market Option</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <div style={lblS}>Freight Rate (USD)</div>
              <input style={inpS} value={inputs.spotFreight} onChange={e => update("spotFreight", e.target.value)} placeholder="360000" />
            </div>
            <div>
              <div style={lblS}>Demurrage Rate (USD/day)</div>
              <input style={inpS} value={inputs.demurrageRate} onChange={e => update("demurrageRate", e.target.value)} placeholder="35000" />
            </div>
            <div>
              <div style={lblS}>Demurrage Days</div>
              <input style={inpS} value={inputs.demurrageDays} onChange={e => update("demurrageDays", e.target.value)} placeholder="0.5" />
            </div>

            <div style={{ marginTop: 16, padding: 12, background: C.bg1, borderRadius: 6, border: "1px solid " + C.bd2 }}>
              <div style={{ fontSize: 11, color: C.faint, marginBottom: 8 }}>SPOT COST BREAKDOWN</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.tx, marginBottom: 4 }}>
                <span>Freight</span>
                <span style={{ fontFamily: "monospace" }}>USD {parseInt(inputs.spotFreight || 0).toLocaleString()}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.tx, marginBottom: 4 }}>
                <span>Demurrage</span>
                <span style={{ fontFamily: "monospace" }}>USD {((parseFloat(inputs.demurrageRate) || 0) * (parseFloat(inputs.demurrageDays) || 0)).toLocaleString()}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.tx, marginBottom: 4 }}>
                <span>Commission</span>
                <span style={{ fontFamily: "monospace" }}>USD {((parseFloat(inputs.spotFreight || 0) + (parseFloat(inputs.demurrageRate) || 0) * (parseFloat(inputs.demurrageDays) || 0)) * (parseFloat(inputs.commission) || 0) / 100).toLocaleString()}</span>
              </div>
              <div style={{ borderTop: "1px solid " + C.bd2, marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700, color: C.tx }}>
                <span>Total</span>
                <span style={{ fontFamily: "monospace" }}>USD {Math.round(results.spotTotal).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* TC Option */}
        <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid " + C.bd2 }}>⏱️ Time Charter Option</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <div style={lblS}>TC Hire (USD/day)</div>
              <input style={inpS} value={inputs.tcHire} onChange={e => update("tcHire", e.target.value)} placeholder="20000" />
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
              <div style={lblS}>Bunkers (USD/MT)</div>
              <input style={inpS} value={inputs.bunkersPrice} onChange={e => update("bunkersPrice", e.target.value)} placeholder="550" />
            </div>
            <div>
              <div style={lblS}>Sea Cons. (MT/day)</div>
              <input style={inpS} value={inputs.seaConsumption} onChange={e => update("seaConsumption", e.target.value)} placeholder="28" />
            </div>
            <div>
              <div style={lblS}>Port Cons. (MT/day)</div>
              <input style={inpS} value={inputs.portConsumption} onChange={e => update("portConsumption", e.target.value)} placeholder="4" />
            </div>
            <div>
              <div style={lblS}>Port Costs (USD)</div>
              <input style={inpS} value={inputs.portCost} onChange={e => update("portCost", e.target.value)} placeholder="45000" />
            </div>

            <div style={{ marginTop: 4, padding: 12, background: C.bg1, borderRadius: 6, border: "1px solid " + C.bd2 }}>
              <div style={{ fontSize: 11, color: C.faint, marginBottom: 8 }}>TC COST BREAKDOWN</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.tx, marginBottom: 4 }}>
                <span>Hire ({results.totalDays}d)</span>
                <span style={{ fontFamily: "monospace" }}>USD {((parseFloat(inputs.tcHire) || 0) * results.totalDays).toLocaleString()}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.tx, marginBottom: 4 }}>
                <span>Bunkers</span>
                <span style={{ fontFamily: "monospace" }}>USD {(((parseFloat(inputs.seaConsumption) || 0) * (parseFloat(inputs.seaDays) || 0) + (parseFloat(inputs.portConsumption) || 0) * (parseFloat(inputs.portDays) || 0)) * (parseFloat(inputs.bunkersPrice) || 0)).toLocaleString()}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.tx, marginBottom: 4 }}>
                <span>Port Costs</span>
                <span style={{ fontFamily: "monospace" }}>USD {parseInt(inputs.portCost || 0).toLocaleString()}</span>
              </div>
              <div style={{ borderTop: "1px solid " + C.bd2, marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700, color: C.tx }}>
                <span>Total</span>
                <span style={{ fontFamily: "monospace" }}>USD {Math.round(results.tcTotal).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Comparison Result */}
      <div style={{ marginTop: 20, background: results.saving > 0 ? C.green + "11" : C.red + "11", border: "2px solid " + (results.saving > 0 ? C.green : C.red), borderRadius: 8, padding: 20, textAlign: "center" }}>
        <div style={{ fontSize: 13, color: C.faint, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
          {results.saving > 0 ? "✓ Time Charter is More Cost Effective" : "✗ Spot Market is More Cost Effective"}
        </div>
        <div style={{ fontSize: 32, fontWeight: 700, color: results.saving > 0 ? C.green : C.red, marginBottom: 4 }}>
          {results.saving > 0 ? "Save " : "Extra Cost "} USD {Math.abs(Math.round(results.saving)).toLocaleString()}
        </div>
        <div style={{ fontSize: 14, color: C.faint }}>
          {Math.abs(results.savingPct).toFixed(1)}% {results.saving > 0 ? "cheaper" : "more expensive"} than {results.saving > 0 ? "spot" : "TC"}
        </div>
      </div>
    </div>
  );
}

// ===== VESSEL PURCHASE CALCULATOR =====
function VesselPurchaseCalculator() {
  const [inputs, setInputs] = useState({
    vesselType: "MR Tanker",
    vesselAge: "0", // 0=Newbuild
    purchasePrice: "42000000",
    debtRatio: "70",
    interestRate: "5.5",
    loanTerm: "12",
    scrapValue: "8000000",
    residualValue: "25000000",
    // Operating mode
    mode: "spot", // spot or tc
    tcHire: "20000",
    spotTCE: "18500",
    // Costs
    opex: "6500",
    drydockCost: "2500000",
    drydockYear: "5",
    upgradeCost: "0",
    upgradeYear: "0",
    depreciation: "linear", // linear or market
    // ROE
    targetROE: "12"
  });

  const update = (key, val) => setInputs(prev => ({ ...prev, [key]: val }));

  const results = useMemo(() => {
    const price = parseFloat(inputs.purchasePrice) || 0;
    const debtPct = parseFloat(inputs.debtRatio) || 0;
    const debt = price * (debtPct / 100);
    const equity = price - debt;
    const intRate = parseFloat(inputs.interestRate) || 0;
    const loanYears = parseFloat(inputs.loanTerm) || 0;
    const opex = parseFloat(inputs.opex) || 0;
    const targetROE = parseFloat(inputs.targetROE) || 0;

    // Annual loan payment (amortization)
    const monthlyRate = intRate / 100 / 12;
    const numPayments = loanYears * 12;
    const monthlyPayment = debt > 0 && monthlyRate > 0 ? debt * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1) : 0;
    const annualDebtService = monthlyPayment * 12;

    // Operating revenue
    const dailyRevenue = inputs.mode === "tc" ? parseFloat(inputs.tcHire) || 0 : parseFloat(inputs.spotTCE) || 0;
    const annualRevenue = dailyRevenue * 350; // 350 trading days

    // Operating costs
    const annualOpex = opex * 365;

    // Cash flow
    const operatingCF = annualRevenue - annualOpex;
    const freeCF = operatingCF - annualDebtService;

    // ROE
    const equityReturn = equity > 0 ? (freeCF / equity) * 100 : 0;

    // Breakeven TCE
    const breakevenTCE = equity > 0 ? (annualDebtService + annualOpex) / 350 : 0;

    // Payback period (simple)
    const paybackYears = freeCF > 0 ? equity / freeCF : 999;

    return {
      debt,
      equity,
      annualDebtService,
      monthlyPayment,
      annualRevenue,
      annualOpex,
      operatingCF,
      freeCF,
      equityReturn,
      breakevenTCE,
      paybackYears,
      meetsROE: equityReturn >= targetROE
    };
  }, [inputs]);

  const inpS = { background: C.bg3, border: "1px solid " + C.bd, borderRadius: 4, color: C.tx, fontFamily: "inherit", fontSize: 13, padding: "6px 10px", outline: "none", width: "100%" };
  const lblS = { fontSize: 11, color: C.faint, marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" };

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: C.tx, margin: "0 0 8px 0" }}>Vessel Purchase ROI Analysis</h3>
        <p style={{ fontSize: 13, color: C.faint, margin: 0 }}>Analyze vessel purchase economics: debt structure, operating earnings, ROE, and payback period</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
        {/* Purchase Details */}
        <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid " + C.bd2 }}>Vessel & Purchase</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <div style={lblS}>Vessel Type</div>
              <input style={inpS} value={inputs.vesselType} onChange={e => update("vesselType", e.target.value)} />
            </div>
            <div>
              <div style={lblS}>Vessel Age</div>
              <select style={inpS} value={inputs.vesselAge} onChange={e => update("vesselAge", e.target.value)}>
                <option value="0">Newbuild</option>
                <option value="5">5 years</option>
                <option value="10">10 years</option>
                <option value="15">15 years</option>
                <option value="20">20 years</option>
              </select>
            </div>
            <div>
              <div style={lblS}>Purchase Price (USD)</div>
              <input style={inpS} value={inputs.purchasePrice} onChange={e => update("purchasePrice", e.target.value)} />
            </div>
            <div>
              <div style={lblS}>Debt Ratio (%)</div>
              <input style={inpS} value={inputs.debtRatio} onChange={e => update("debtRatio", e.target.value)} />
            </div>
            <div>
              <div style={lblS}>Interest Rate (%)</div>
              <input style={inpS} value={inputs.interestRate} onChange={e => update("interestRate", e.target.value)} />
            </div>
            <div>
              <div style={lblS}>Loan Term (years)</div>
              <input style={inpS} value={inputs.loanTerm} onChange={e => update("loanTerm", e.target.value)} />
            </div>
            <div>
              <div style={lblS}>Scrap Value (USD)</div>
              <input style={inpS} value={inputs.scrapValue} onChange={e => update("scrapValue", e.target.value)} />
            </div>
            <div>
              <div style={lblS}>Residual Value (USD)</div>
              <input style={inpS} value={inputs.residualValue} onChange={e => update("residualValue", e.target.value)} />
            </div>
          </div>
        </div>

        {/* Operating Mode */}
        <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid " + C.bd2 }}>Operating Strategy</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <div style={lblS}>Operating Mode</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => update("mode", "spot")} style={{ flex: 1, fontSize: 12, fontWeight: 600, padding: "8px", borderRadius: 6, border: "1px solid " + (inputs.mode === "spot" ? C.blue : C.bd), background: inputs.mode === "spot" ? C.blue + "22" : C.bg3, color: inputs.mode === "spot" ? C.blue : C.dim, cursor: "pointer" }}>Spot Market</button>
                <button onClick={() => update("mode", "tc")} style={{ flex: 1, fontSize: 12, fontWeight: 600, padding: "8px", borderRadius: 6, border: "1px solid " + (inputs.mode === "tc" ? C.blue : C.bd), background: inputs.mode === "tc" ? C.blue + "22" : C.bg3, color: inputs.mode === "tc" ? C.blue : C.dim, cursor: "pointer" }}>Time Charter</button>
              </div>
            </div>
            {inputs.mode === "spot" && (
              <div>
                <div style={lblS}>Spot TCE (USD/day)</div>
                <input style={inpS} value={inputs.spotTCE} onChange={e => update("spotTCE", e.target.value)} />
              </div>
            )}
            {inputs.mode === "tc" && (
              <div>
                <div style={lblS}>TC Hire (USD/day)</div>
                <input style={inpS} value={inputs.tcHire} onChange={e => update("tcHire", e.target.value)} />
              </div>
            )}
            <div>
              <div style={lblS}>OPEX (USD/day)</div>
              <input style={inpS} value={inputs.opex} onChange={e => update("opex", e.target.value)} />
            </div>
            <div>
              <div style={lblS}>Drydock Cost (USD)</div>
              <input style={inpS} value={inputs.drydockCost} onChange={e => update("drydockCost", e.target.value)} />
            </div>
            <div>
              <div style={lblS}>Drydock Year</div>
              <input style={inpS} value={inputs.drydockYear} onChange={e => update("drydockYear", e.target.value)} />
            </div>
            <div>
              <div style={lblS}>Upgrade Cost (USD)</div>
              <input style={inpS} value={inputs.upgradeCost} onChange={e => update("upgradeCost", e.target.value)} />
            </div>
            <div>
              <div style={lblS}>Upgrade Year</div>
              <input style={inpS} value={inputs.upgradeYear} onChange={e => update("upgradeYear", e.target.value)} />
            </div>
            <div>
              <div style={lblS}>Target ROE (%)</div>
              <input style={inpS} value={inputs.targetROE} onChange={e => update("targetROE", e.target.value)} />
            </div>
          </div>
        </div>

        {/* Financial Summary */}
        <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid " + C.bd2 }}>Financial Summary</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ padding: 12, background: C.bg1, borderRadius: 6, border: "1px solid " + C.bd2 }}>
              <div style={{ fontSize: 11, color: C.faint, marginBottom: 6 }}>CAPITAL STRUCTURE</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.tx, marginBottom: 3 }}>
                <span>Debt ({inputs.debtRatio}%)</span>
                <span style={{ fontFamily: "monospace" }}>USD {Math.round(results.debt).toLocaleString()}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.tx }}>
                <span>Equity ({100 - parseFloat(inputs.debtRatio)}%)</span>
                <span style={{ fontFamily: "monospace" }}>USD {Math.round(results.equity).toLocaleString()}</span>
              </div>
            </div>

            <div style={{ padding: 12, background: C.bg1, borderRadius: 6, border: "1px solid " + C.bd2 }}>
              <div style={{ fontSize: 11, color: C.faint, marginBottom: 6 }}>ANNUAL CASH FLOW</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.tx, marginBottom: 3 }}>
                <span>Revenue</span>
                <span style={{ fontFamily: "monospace", color: C.green }}>+{Math.round(results.annualRevenue).toLocaleString()}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.tx, marginBottom: 3 }}>
                <span>OPEX</span>
                <span style={{ fontFamily: "monospace", color: C.red }}>-{Math.round(results.annualOpex).toLocaleString()}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.tx, marginBottom: 6, paddingBottom: 6, borderBottom: "1px solid " + C.bd2 }}>
                <span>Debt Service</span>
                <span style={{ fontFamily: "monospace", color: C.red }}>-{Math.round(results.annualDebtService).toLocaleString()}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, color: C.tx }}>
                <span>Free Cash Flow</span>
                <span style={{ fontFamily: "monospace", color: results.freeCF > 0 ? C.green : C.red }}>{results.freeCF > 0 ? "+" : ""}{Math.round(results.freeCF).toLocaleString()}</span>
              </div>
            </div>

            <div style={{ padding: 12, background: results.meetsROE ? C.green + "11" : C.amber + "11", borderRadius: 6, border: "1px solid " + (results.meetsROE ? C.green : C.amber) }}>
              <div style={{ fontSize: 11, color: C.faint, marginBottom: 6 }}>RETURN ON EQUITY</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: results.meetsROE ? C.green : C.amber, marginBottom: 4 }}>
                {results.equityReturn.toFixed(1)}%
              </div>
              <div style={{ fontSize: 11, color: C.faint }}>
                {results.meetsROE ? `✓ Meets ${inputs.targetROE}% target` : `✗ Below ${inputs.targetROE}% target`}
              </div>
            </div>

            <div style={{ padding: 12, background: C.bg1, borderRadius: 6, border: "1px solid " + C.bd2 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.tx, marginBottom: 6 }}>
                <span>Breakeven TCE</span>
                <span style={{ fontFamily: "monospace", fontWeight: 700 }}>USD {Math.round(results.breakevenTCE).toLocaleString()}/day</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.tx }}>
                <span>Payback Period</span>
                <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{results.paybackYears < 99 ? results.paybackYears.toFixed(1) + " years" : "N/A"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Year by year breakdown could go here */}
      <div style={{ marginTop: 20, background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 12 }}>Key Metrics</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <div style={{ padding: 12, background: C.bg1, borderRadius: 6, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: C.faint, marginBottom: 4 }}>Monthly Debt Payment</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.tx }}>USD {Math.round(results.monthlyPayment).toLocaleString()}</div>
          </div>
          <div style={{ padding: 12, background: C.bg1, borderRadius: 6, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: C.faint, marginBottom: 4 }}>Operating CF</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.tx }}>USD {Math.round(results.operatingCF).toLocaleString()}</div>
          </div>
          <div style={{ padding: 12, background: C.bg1, borderRadius: 6, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: C.faint, marginBottom: 4 }}>Daily Revenue</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.tx }}>USD {(inputs.mode === "tc" ? inputs.tcHire : inputs.spotTCE).toLocaleString()}</div>
          </div>
          <div style={{ padding: 12, background: C.bg1, borderRadius: 6, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: C.faint, marginBottom: 4 }}>Daily Net</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: results.freeCF > 0 ? C.green : C.red }}>USD {Math.round(results.freeCF / 350).toLocaleString()}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== BAREBOAT CHARTER CALCULATOR =====
function BareboatCalculator() {
  const [inputs, setInputs] = useState({
    vesselType: "MR Tanker",
    purchasePrice: "42000000",
    debtRatio: "80",
    interestRate: "5.0",
    bbcPeriod: "10",
    targetMargin: "8",
    scrapValue: "8000000",
    // BBC hire calculation
    calcMode: "solve", // solve for hire or check viability
    bbcHire: "12000"
  });

  const update = (key, val) => setInputs(prev => ({ ...prev, [key]: val }));

  const results = useMemo(() => {
    const price = parseFloat(inputs.purchasePrice) || 0;
    const debtPct = parseFloat(inputs.debtRatio) || 0;
    const debt = price * (debtPct / 100);
    const equity = price - debt;
    const intRate = parseFloat(inputs.interestRate) || 0;
    const years = parseFloat(inputs.bbcPeriod) || 0;
    const scrapValue = parseFloat(inputs.scrapValue) || 0;
    const marginPct = parseFloat(inputs.targetMargin) || 0;

    // Annual debt service
    const monthlyRate = intRate / 100 / 12;
    const numPayments = years * 12;
    const monthlyPayment = debt > 0 && monthlyRate > 0 ? debt * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1) : 0;
    const annualDebtService = monthlyPayment * 12;

    // Required BBC hire to cover debt + margin
    const requiredAnnualBBC = annualDebtService / (1 - marginPct / 100);
    const requiredDailyBBC = requiredAnnualBBC / 365;

    // If user provides BBC hire, calculate margin and debt coverage
    const givenHire = parseFloat(inputs.bbcHire) || 0;
    const givenAnnualBBC = givenHire * 365;
    const actualMargin = annualDebtService > 0 ? ((givenAnnualBBC - annualDebtService) / givenAnnualBBC) * 100 : 0;

    // Debt amortization over period
    let remainingDebt = debt;
    const yearlyBreakdown = [];
    for (let y = 1; y <= years; y++) {
      const interestPayment = remainingDebt * (intRate / 100);
      const principalPayment = annualDebtService - interestPayment;
      remainingDebt -= principalPayment;
      yearlyBreakdown.push({
        year: y,
        debtStart: remainingDebt + principalPayment,
        interest: interestPayment,
        principal: principalPayment,
        debtEnd: Math.max(0, remainingDebt)
      });
    }

    const debtPaidOff = debt - Math.max(0, remainingDebt);
    const vesselBookValue = price - (price - scrapValue) * (years / 25); // Linear depreciation over 25yr

    return {
      debt,
      equity,
      annualDebtService,
      monthlyPayment,
      requiredDailyBBC,
      requiredAnnualBBC,
      givenAnnualBBC,
      actualMargin,
      debtPaidOff,
      remainingDebt: Math.max(0, remainingDebt),
      vesselBookValue,
      yearlyBreakdown
    };
  }, [inputs]);

  const inpS = { background: C.bg3, border: "1px solid " + C.bd, borderRadius: 4, color: C.tx, fontFamily: "inherit", fontSize: 13, padding: "6px 10px", outline: "none", width: "100%" };
  const lblS = { fontSize: 11, color: C.faint, marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" };

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: C.tx, margin: "0 0 8px 0" }}>Bareboat Charter (BBC) Analysis</h3>
        <p style={{ fontSize: 13, color: C.faint, margin: 0 }}>Calculate required bareboat hire to finance vessel purchase and analyze debt amortization over the charter period</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
        {/* Vessel & Finance */}
        <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid " + C.bd2 }}>Vessel & Finance</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <div style={lblS}>Vessel Type</div>
              <input style={inpS} value={inputs.vesselType} onChange={e => update("vesselType", e.target.value)} />
            </div>
            <div>
              <div style={lblS}>Purchase Price (USD)</div>
              <input style={inpS} value={inputs.purchasePrice} onChange={e => update("purchasePrice", e.target.value)} />
            </div>
            <div>
              <div style={lblS}>Debt Ratio (%)</div>
              <input style={inpS} value={inputs.debtRatio} onChange={e => update("debtRatio", e.target.value)} />
            </div>
            <div>
              <div style={lblS}>Interest Rate (%)</div>
              <input style={inpS} value={inputs.interestRate} onChange={e => update("interestRate", e.target.value)} />
            </div>
            <div>
              <div style={lblS}>BBC Period (years)</div>
              <input style={inpS} value={inputs.bbcPeriod} onChange={e => update("bbcPeriod", e.target.value)} />
            </div>
            <div>
              <div style={lblS}>Target Margin (%)</div>
              <input style={inpS} value={inputs.targetMargin} onChange={e => update("targetMargin", e.target.value)} />
            </div>
            <div>
              <div style={lblS}>Scrap Value (USD)</div>
              <input style={inpS} value={inputs.scrapValue} onChange={e => update("scrapValue", e.target.value)} />
            </div>
          </div>
        </div>

        {/* BBC Hire */}
        <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid " + C.bd2 }}>Bareboat Hire</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <div style={lblS}>Calculation Mode</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => update("calcMode", "solve")} style={{ flex: 1, fontSize: 11, fontWeight: 600, padding: "8px", borderRadius: 6, border: "1px solid " + (inputs.calcMode === "solve" ? C.blue : C.bd), background: inputs.calcMode === "solve" ? C.blue + "22" : C.bg3, color: inputs.calcMode === "solve" ? C.blue : C.dim, cursor: "pointer" }}>Solve for Hire</button>
                <button onClick={() => update("calcMode", "check")} style={{ flex: 1, fontSize: 11, fontWeight: 600, padding: "8px", borderRadius: 6, border: "1px solid " + (inputs.calcMode === "check" ? C.blue : C.bd), background: inputs.calcMode === "check" ? C.blue + "22" : C.bg3, color: inputs.calcMode === "check" ? C.blue : C.dim, cursor: "pointer" }}>Check Viability</button>
              </div>
            </div>

            {inputs.calcMode === "solve" ? (
              <div style={{ marginTop: 12, padding: 16, background: C.blue + "11", borderRadius: 6, border: "2px solid " + C.blue }}>
                <div style={{ fontSize: 11, color: C.faint, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Required Daily BBC Hire</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: C.blue, marginBottom: 4 }}>
                  USD {Math.round(results.requiredDailyBBC).toLocaleString()}
                </div>
                <div style={{ fontSize: 12, color: C.faint }}>
                  USD {Math.round(results.requiredAnnualBBC).toLocaleString()} / year
                </div>
                <div style={{ fontSize: 11, color: C.faint, marginTop: 8 }}>
                  to cover debt service + {inputs.targetMargin}% margin
                </div>
              </div>
            ) : (
              <>
                <div>
                  <div style={lblS}>Proposed BBC Hire (USD/day)</div>
                  <input style={inpS} value={inputs.bbcHire} onChange={e => update("bbcHire", e.target.value)} />
                </div>
                <div style={{ marginTop: 12, padding: 16, background: results.actualMargin >= parseFloat(inputs.targetMargin) ? C.green + "11" : C.red + "11", borderRadius: 6, border: "2px solid " + (results.actualMargin >= parseFloat(inputs.targetMargin) ? C.green : C.red) }}>
                  <div style={{ fontSize: 11, color: C.faint, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Actual Margin</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: results.actualMargin >= parseFloat(inputs.targetMargin) ? C.green : C.red, marginBottom: 4 }}>
                    {results.actualMargin.toFixed(1)}%
                  </div>
                  <div style={{ fontSize: 11, color: C.faint }}>
                    {results.actualMargin >= parseFloat(inputs.targetMargin) ? `✓ Meets ${inputs.targetMargin}% target` : `✗ Below ${inputs.targetMargin}% target`}
                  </div>
                </div>
              </>
            )}

            <div style={{ marginTop: 12, padding: 12, background: C.bg1, borderRadius: 6, border: "1px solid " + C.bd2 }}>
              <div style={{ fontSize: 11, color: C.faint, marginBottom: 6 }}>CAPITAL STRUCTURE</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.tx, marginBottom: 3 }}>
                <span>Debt ({inputs.debtRatio}%)</span>
                <span style={{ fontFamily: "monospace" }}>USD {Math.round(results.debt).toLocaleString()}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.tx }}>
                <span>Equity ({100 - parseFloat(inputs.debtRatio)}%)</span>
                <span style={{ fontFamily: "monospace" }}>USD {Math.round(results.equity).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* End of Period Status */}
        <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid " + C.bd2 }}>End of Period Status</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ padding: 12, background: C.bg1, borderRadius: 6, border: "1px solid " + C.bd2 }}>
              <div style={{ fontSize: 11, color: C.faint, marginBottom: 6 }}>AFTER {inputs.bbcPeriod} YEARS</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.tx, marginBottom: 4 }}>
                <span>Debt Paid Off</span>
                <span style={{ fontFamily: "monospace", color: C.green }}>USD {Math.round(results.debtPaidOff).toLocaleString()}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.tx, marginBottom: 4 }}>
                <span>Remaining Debt</span>
                <span style={{ fontFamily: "monospace", color: results.remainingDebt > 0 ? C.amber : C.green }}>USD {Math.round(results.remainingDebt).toLocaleString()}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.tx }}>
                <span>Vessel Book Value</span>
                <span style={{ fontFamily: "monospace" }}>USD {Math.round(results.vesselBookValue).toLocaleString()}</span>
              </div>
            </div>

            <div style={{ padding: 12, background: C.bg1, borderRadius: 6, border: "1px solid " + C.bd2 }}>
              <div style={{ fontSize: 11, color: C.faint, marginBottom: 6 }}>EQUITY POSITION</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.tx, marginBottom: 4 }}>
                <span>Book Value</span>
                <span style={{ fontFamily: "monospace" }}>USD {Math.round(results.vesselBookValue).toLocaleString()}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.tx, marginBottom: 6, paddingBottom: 6, borderBottom: "1px solid " + C.bd2 }}>
                <span>Less: Debt</span>
                <span style={{ fontFamily: "monospace" }}>USD {Math.round(results.remainingDebt).toLocaleString()}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, color: C.green }}>
                <span>Net Equity</span>
                <span style={{ fontFamily: "monospace" }}>USD {Math.round(results.vesselBookValue - results.remainingDebt).toLocaleString()}</span>
              </div>
            </div>

            <div style={{ padding: 12, background: C.bg1, borderRadius: 6, border: "1px solid " + C.bd2 }}>
              <div style={{ fontSize: 11, color: C.faint, marginBottom: 6 }}>DEBT SERVICE</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.tx, marginBottom: 4 }}>
                <span>Monthly Payment</span>
                <span style={{ fontFamily: "monospace" }}>USD {Math.round(results.monthlyPayment).toLocaleString()}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.tx }}>
                <span>Annual Payment</span>
                <span style={{ fontFamily: "monospace" }}>USD {Math.round(results.annualDebtService).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Amortization Schedule */}
      <div style={{ marginTop: 20, background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 12 }}>Debt Amortization Schedule</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid " + C.bd }}>
                <th style={{ padding: "8px", textAlign: "left", color: C.faint, fontWeight: 600 }}>Year</th>
                <th style={{ padding: "8px", textAlign: "right", color: C.faint, fontWeight: 600 }}>Debt Start</th>
                <th style={{ padding: "8px", textAlign: "right", color: C.faint, fontWeight: 600 }}>Interest</th>
                <th style={{ padding: "8px", textAlign: "right", color: C.faint, fontWeight: 600 }}>Principal</th>
                <th style={{ padding: "8px", textAlign: "right", color: C.faint, fontWeight: 600 }}>Debt End</th>
              </tr>
            </thead>
            <tbody>
              {results.yearlyBreakdown.map(row => (
                <tr key={row.year} style={{ borderBottom: "1px solid " + C.bd2 }}>
                  <td style={{ padding: "8px", color: C.tx }}>{row.year}</td>
                  <td style={{ padding: "8px", textAlign: "right", fontFamily: "monospace", color: C.tx }}>USD {Math.round(row.debtStart).toLocaleString()}</td>
                  <td style={{ padding: "8px", textAlign: "right", fontFamily: "monospace", color: C.red }}>USD {Math.round(row.interest).toLocaleString()}</td>
                  <td style={{ padding: "8px", textAlign: "right", fontFamily: "monospace", color: C.green }}>USD {Math.round(row.principal).toLocaleString()}</td>
                  <td style={{ padding: "8px", textAlign: "right", fontFamily: "monospace", color: C.tx, fontWeight: 600 }}>USD {Math.round(row.debtEnd).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default ProjectsTab;

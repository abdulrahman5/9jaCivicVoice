"use client";

import { useState } from "react";
import { PollingUnitPicker, UnitCard, type PollingUnit } from "@/components/election/PollingUnitPicker";

export function FindUnit() {
  const [unit, setUnit] = useState<PollingUnit | null>(null);
  return unit ? <UnitCard unit={unit} onChange={() => setUnit(null)} /> : <PollingUnitPicker onSelect={setUnit} />;
}

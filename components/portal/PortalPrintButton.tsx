"use client";

import React from "react";

export default function PortalPrintButton() {
  return <div className="print-controls"><button type="button" onClick={() => window.print()}>Print document</button></div>;
}

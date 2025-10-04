"use client";

import * as React from "react";
import Ansi from "ansi-to-react";

type AnsiViewProps = {
  children: string;
};

export function AnsiView({ children }: AnsiViewProps) {
  return (
    <div className="rounded-md bg-black text-white p-3 text-xs font-mono overflow-x-auto">
      <Ansi>{children}</Ansi>
    </div>
  );
}

export default AnsiView;



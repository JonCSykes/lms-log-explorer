"use client";

import { useState } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

interface SessionTabsProps {
  children: React.ReactNode;
}

export default function SessionTabs({ children }: SessionTabsProps) {
  const [value, setValue] = useState("tool-calls");

  return (
    <Tabs value={value} onValueChange={setValue} className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="tool-calls">Tool Calls</TabsTrigger>
        <TabsTrigger value="metrics">Metrics</TabsTrigger>
        <TabsTrigger value="timeline">Timeline</TabsTrigger>
      </TabsList>
      {children}
    </Tabs>
  );
}

export function ToolCallsTab({ children }: { children: React.ReactNode }) {
  return (
    <TabsContent value="tool-calls">
      {children}
    </TabsContent>
  );
}

export function MetricsTab({ children }: { children: React.ReactNode }) {
  return (
    <TabsContent value="metrics">
      {children}
    </TabsContent>
  );
}

export function TimelineTab({ children }: { children: React.ReactNode }) {
  return (
    <TabsContent value="timeline">
      {children}
    </TabsContent>
  );
}

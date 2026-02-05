"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ToolCall {
  id: string;
  name: string;
  argumentsText: string;
  argumentsJson?: Record<string, unknown>;
}

interface ToolCallsPanelProps {
  toolCalls: ToolCall[];
}

export default function ToolCallsPanel({ toolCalls }: ToolCallsPanelProps) {
  if (toolCalls.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tool Calls</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No tool calls found</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Tool Calls ({toolCalls.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {toolCalls.map((call, index) => {
              const argsObj =
                call.argumentsJson || ({} as Record<string, unknown>);
              
              return (
                <AccordionItem value={`tool-${index}`} key={call.id}>
                  <AccordionTrigger className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold">{call.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {call.id}
                      </div>
                    </div>
                    <Badge variant="secondary">Tool</Badge>
                  </AccordionTrigger>
                  <AccordionContent>
                    {call.argumentsJson ? (
                      <div className="mt-3">
                        <Table>
                          <TableBody>
                            {Object.entries(argsObj).map(([key, value]) => (
                              <TableRow key={key}>
                                <TableHead className="w-1/3 font-medium">
                                  {key}
                                </TableHead>
                                <TableCell className="font-mono text-sm">
                                  {typeof value === "object"
                                    ? JSON.stringify(value, null, 2)
                                    : String(value)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <pre className="mt-3 overflow-auto rounded bg-muted p-3 text-sm">
                        {call.argumentsText}
                      </pre>
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}

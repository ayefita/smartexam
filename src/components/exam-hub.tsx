"use client";

import { useState } from "react";
import { setExamStatusAction } from "@/app/actions/staff";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Dictionary } from "@/lib/i18n";

export function PublishButton({
  dict,
  examId,
  questions,
  students,
  hasWindow,
  primary,
}: {
  dict: Dictionary;
  examId: string;
  questions: number;
  students: number;
  hasWindow: boolean;
  primary: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hub = dict.ux.hub;
  const warnings = [questions < 1 ? hub.wQ : "", students < 1 ? hub.wS : "", !hasWindow ? hub.wT : ""].filter(Boolean);
  return (
    <>
      <Button type="button" variant={primary ? "default" : "outline"} className="h-11 px-5 text-base" onClick={() => setOpen(true)}>
        {hub.publish}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{hub.publishTitle}</DialogTitle>
            <DialogDescription>{hub.publishWill}</DialogDescription>
          </DialogHeader>
          <ul className="grid list-disc gap-1 pl-5 text-sm">
            <li>{hub.pA}</li>
            <li>{hub.pB}</li>
            {students > 0 ? <li>{hub.pC}</li> : null}
          </ul>
          {warnings.length ? (
            <ul className="grid gap-1 rounded-lg bg-[#f8efd4] p-3 text-sm text-[#5c4718]" role="alert">
              {warnings.map((warning) => <li key={warning}>⚠ {warning}</li>)}
            </ul>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" className="h-10" onClick={() => setOpen(false)}>{hub.cancel}</Button>
            <form action={setExamStatusAction}>
              <input type="hidden" name="id" value={examId} />
              <input type="hidden" name="status" value="published" />
              <Button type="submit" className="h-10" disabled={questions < 1}>{hub.yes}</Button>
            </form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

import { requireElectionStaff } from "@/modules/election/staff";
import { trainingQuestions } from "@/modules/election/training";
import { TrainingForm } from "./TrainingForm";

export const dynamic = "force-dynamic";

/** The training check (task E5). Every answer must be right; wrong ones explain why. */
export default async function TrainingPage() {
  const staff = await requireElectionStaff();
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-bold">Training check</h1>
      <p className="text-sm text-muted">
        {staff.trained
          ? "You've already passed. Take it again any time as a refresher."
          : "Answer all seven correctly to start moderating real reports. You can try as many times as you need."}
      </p>
      <TrainingForm questions={trainingQuestions()} />
    </div>
  );
}

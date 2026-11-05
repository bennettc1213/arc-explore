import Link from "next/link";

/** The application opens immediately; questions are asked against the actual
 * form by the extension rather than by a separate preparation wizard. */
export function ApplyWizard({ boot }: { boot: { postingId: string } }) {
  return <Link href={`/listing/${boot.postingId}/apply`} className="btn btn-primary press">Apply with Instela</Link>;
}

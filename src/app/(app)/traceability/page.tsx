import { notFound } from "next/navigation";

/*
  Not offered yet: this screen has no backend and its view showed sample data.
  It answers 404 until it is wired to real data (view kept at views/Traceability).
*/
export default function Page() {
  notFound();
}

import { NousLoader } from "@nous/motion/loader";

// A API desejada, exatamente como pedida no briefing.
export function Loading() {
  return <NousLoader template="orbit" primaryColor="#FF6B00" size={48} speed={1.2} state="loading" />;
}

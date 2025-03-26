import ContactForm from "@/components/contact-form";

export const metadata = {
  title: "Get in touch - Just Noted",
  description:
    "If you have any ideas, questions, or feedback on how to make Just Noted even better please get in touch. We'd" +
    " love to hear from you.",
};

export default function ContactPage() {
  return (
    <div className={`pt-3 sm:text-center`}>
      <h1 className={`text-xl font-semibold`}>Get in touch</h1>
      <h2 className={`font-light`}>Have any ideas? Questions? Feedback?</h2>
      <ContactForm />
    </div>
  );
}

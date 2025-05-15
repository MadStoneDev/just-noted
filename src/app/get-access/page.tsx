import AuthForm from "@/components/auth-form";

export default function GetAccessPage() {
  return (
    <div
      className={`p-10 mx-auto max-w-lg flex flex-col items-center justify-center`}
    >
      <h1 className={`text-xl font-semibold sm:text-center`}>
        Let's help you get access to{" "}
        <span className={`p-1 bg-mercedes-primary font-secondary`}>
          Just
          <span className={`text-white`}>Noted</span>
        </span>
        !
      </h1>

      <section
        className={`sm:mx-auto flex flex-col sm:max-w-lg font-light`}
        style={{
          lineHeight: "1.75rem",
        }}
      >
        <AuthForm />
      </section>
    </div>
  );
}

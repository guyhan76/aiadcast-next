import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.CodeSigner;
import java.security.MessageDigest;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
import java.util.HexFormat;
import java.util.Locale;
import java.util.jar.JarFile;

class VerifyBundle {
    public static void main(String[] args) throws Exception {
        if (args.length != 2) throw new IllegalArgumentException("Expected bundle and public upload certificate");
        Certificate expected;
        try (var stream = Files.newInputStream(Path.of(args[1]))) {
            expected = CertificateFactory.getInstance("X.509").generateCertificate(stream);
        }
        try (JarFile bundle = new JarFile(args[0], true)) {
            for (String required : new String[]{"BundleConfig.pb", "base/manifest/AndroidManifest.xml"}) {
                if (bundle.getEntry(required) == null) throw new SecurityException("Missing " + required);
            }
            var entries = bundle.entries();
            while (entries.hasMoreElements()) {
                var entry = entries.nextElement();
                String name = entry.getName().toUpperCase(Locale.ROOT);
                if (entry.isDirectory() || name.equals("META-INF/MANIFEST.MF")
                    || name.matches("META-INF/[^/]+\\.(SF|RSA|DSA|EC)")) continue;
                // Reading to EOF makes JarFile verify the content digest and signature.
                try (InputStream stream = bundle.getInputStream(entry)) {
                    stream.transferTo(OutputStream.nullOutputStream());
                }
                CodeSigner[] signers = entry.getCodeSigners();
                if (signers == null || signers.length != 1
                    || !expected.equals(signers[0].getSignerCertPath().getCertificates().get(0))) {
                    throw new SecurityException("Unexpected or missing signer: " + entry.getName());
                }
            }
        }
        var fingerprint = MessageDigest.getInstance("SHA-256").digest(expected.getEncoded());
        System.out.println("Verified upload certificate SHA-256: " + HexFormat.of().formatHex(fingerprint));
    }
}

package com.selluplabs.aiadcast.next;

import java.io.*;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;

/** App-private export recovery only; never reads projects, credentials or destination URIs. */
public final class ExportJournal {
    public static final long TTL = 24L * 60 * 60 * 1000;
    private static final Object LOCK = new Object();
    private static final Set<String> WRITERS = new HashSet<>();
    private final File root, sequence;
    public static final class Entry {
        public String id, owner, mime, filename, hash, stage;
        public long size, created;
        public int code;
    }
    public ExportJournal(File cacheRoot, File sequenceFile) throws IOException {
        root = cacheRoot.getCanonicalFile(); sequence = sequenceFile;
        if (!root.isDirectory() && !root.mkdirs()) throw new IOException("Export storage unavailable");
    }
    private File child(String name) throws IOException {
        File f = new File(root, name);
        if (Files.isSymbolicLink(f.toPath()) || !f.getCanonicalFile().getParentFile().equals(root)) throw new IOException("Unsafe export path");
        return f;
    }
    private File payload(Entry e) throws IOException { return child(e.id + ("image/png".equals(e.mime) ? ".png" : ".json")); }
    private static boolean ownerValid(String owner) { return owner != null && !owner.isEmpty() && owner.length() <= 512 && !owner.matches(".*[\\p{Cntrl}].*"); }
    private static String digest(byte[] bytes) throws IOException {
        try { byte[] hash = MessageDigest.getInstance("SHA-256").digest(bytes); StringBuilder s = new StringBuilder(); for (byte b : hash) s.append(String.format(Locale.ROOT,"%02x",b & 255)); return s.toString(); }
        catch (Exception e) { throw new IOException("Hash unavailable"); }
    }
    private Entry read() throws IOException {
        File f=child("pending.properties"); if(!f.exists()) return null;
        if(f.length()>4096)throw new IOException("Invalid export record");
        Properties p=new Properties();try(InputStream in=new FileInputStream(f)){p.load(in);}
        Entry e=new Entry();
        try {
            e.id=p.getProperty("id"); e.owner=p.getProperty("owner"); e.mime=p.getProperty("mime"); e.filename=p.getProperty("filename"); e.hash=p.getProperty("hash"); e.stage=p.getProperty("stage");
            e.size=Long.parseLong(p.getProperty("size"));e.created=Long.parseLong(p.getProperty("created"));e.code=Integer.parseInt(p.getProperty("code"));
            if(e.id==null||!e.id.matches("[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}")||!ownerValid(e.owner)||!ExportPolicy.supportsMime(e.mime)||!ExportPolicy.safeFilename(e.filename,e.mime).equals(e.filename)||!e.hash.matches("[a-f0-9]{64}")||e.size<=0||e.size>ExportPolicy.MAX_BYTES||e.created<0||e.code<0||e.code>65534||!Arrays.asList("ready","picking","writing").contains(e.stage))throw new IllegalArgumentException();
        } catch(Exception invalid){throw new IOException("Invalid export record");}
        return e;
    }
    private void write(Entry e) throws IOException {
        Properties p=new Properties();p.setProperty("id",e.id);p.setProperty("owner",e.owner);p.setProperty("mime",e.mime);p.setProperty("filename",e.filename);p.setProperty("hash",e.hash);p.setProperty("stage",e.stage);p.setProperty("size",Long.toString(e.size));p.setProperty("created",Long.toString(e.created));p.setProperty("code",Integer.toString(e.code));
        File temp=child("pending.tmp");try(FileOutputStream out=new FileOutputStream(temp)){p.store(out,null);out.getFD().sync();}
        Files.move(temp.toPath(),child("pending.properties").toPath(),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);
    }
    private void discard(Entry e, boolean delete) throws IOException {
        Files.deleteIfExists(child("pending.properties").toPath());
        // id and mime are validated before this call; unlink a substituted symlink, never its target.
        if(delete&&e!=null)Files.deleteIfExists(new File(root,e.id+("image/png".equals(e.mime)?".png":".json")).toPath());
    }
    private boolean expired(Entry e,long now){return e.created>now+60000||now-e.created>=TTL;}
    public Entry recover(String owner,long now) throws IOException { synchronized(LOCK){
        Entry e;
        try {e=read();}catch(IOException invalid){Files.deleteIfExists(child("pending.properties").toPath());throw invalid;}
        if(e==null)return null;
        if(!Objects.equals(owner,e.owner)||expired(e,now)){discard(e,true);return null;}
        try {verifiedBytes(e);}catch(IOException invalid){discard(e,true);throw invalid;}
        return e;
    }}
    public Entry prepare(String id,String owner,String name,String mime,byte[] bytes,long now) throws IOException { synchronized(LOCK){
        if(!ownerValid(owner)||id==null||!id.matches("[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}")||!ExportPolicy.validContent(bytes,mime))throw new IOException("Invalid export");
        if(read()!=null)throw new IOException("An export is pending");
        Entry e=new Entry();e.id=id;e.owner=owner;e.mime=mime;e.filename=ExportPolicy.safeFilename(name,mime);e.size=bytes.length;e.hash=digest(bytes);e.created=now;e.stage="ready";
        File f=payload(e);if(!f.createNewFile())throw new IOException("Export identifier already exists");
        try {try(FileOutputStream out=new FileOutputStream(f)){out.write(bytes);out.getFD().sync();}write(e);return e;}
        catch(IOException failure){Files.deleteIfExists(f.toPath());throw failure;}
    }}
    public byte[] verifiedBytes(Entry expected) throws IOException { synchronized(LOCK){
        File f=payload(expected);if(!f.isFile()||f.length()!=expected.size)throw new IOException("Export file missing or incomplete");
        byte[] bytes=Files.readAllBytes(f.toPath());if(!ExportPolicy.validContent(bytes,expected.mime)||!digest(bytes).equals(expected.hash))throw new IOException("Export file changed");return bytes;
    }}
    public void copyTo(Entry entry,OutputStream output,java.util.function.BooleanSupplier allowed) throws IOException {
        byte[] bytes=verifiedBytes(entry);
        for(int offset=0;offset<bytes.length;offset+=16384){
            if(!allowed.getAsBoolean())throw new IOException("Export cancelled");
            output.write(bytes,offset,Math.min(16384,bytes.length-offset));
        }
        if(!allowed.getAsBoolean())throw new IOException("Export cancelled");
        output.flush();
    }
    public File file(Entry e) throws IOException { synchronized(LOCK){verifiedBytes(e);return payload(e);} }
    public Entry picking(String id,String owner,long now) throws IOException { synchronized(LOCK){
        Entry e=recover(owner,now);if(e==null||!e.id.equals(id)||WRITERS.contains(id))throw new IOException("Export unavailable");
        int code=4096;
        if(sequence.exists()){try(DataInputStream in=new DataInputStream(new FileInputStream(sequence))){code=in.readInt();}}
        if(code<4096||code>=65534)throw new IOException("Export request capacity reached");
        // Reserve before launch. Never reuse an old picker callback's request code.
        try(FileOutputStream file=new FileOutputStream(sequence);DataOutputStream out=new DataOutputStream(file)){out.writeInt(code+1);out.flush();file.getFD().sync();}
        e.code=code;e.stage="picking";write(e);return e;
    }}
    public Entry claim(int code,String owner,long now) throws IOException { synchronized(LOCK){
        Entry e=recover(owner,now);if(e==null||e.code!=code||!e.stage.equals("picking")||WRITERS.contains(e.id))return null;
        e.stage="writing";write(e);WRITERS.add(e.id);return e;
    }}
    public boolean matches(int code,String owner) throws IOException { synchronized(LOCK){Entry e=read();return e!=null&&e.code==code&&e.owner.equals(owner)&&e.stage.equals("picking");} }
    public boolean active(String id,String owner) throws IOException { synchronized(LOCK){Entry e=read();return e!=null&&e.id.equals(id)&&e.owner.equals(owner);} }
    public boolean writing(String id){ synchronized(LOCK){return WRITERS.contains(id);} }
    public void finish(String id,boolean saved) throws IOException { synchronized(LOCK){
        WRITERS.remove(id);Entry e=read();if(e==null||!e.id.equals(id))return;
        if(saved)discard(e,true);else{e.stage="ready";write(e);}
    }}
    public void cancel(String id,boolean delete) throws IOException { synchronized(LOCK){Entry e=read();if(e!=null&&e.id.equals(id))discard(e,delete);} }
    public void isolate(String owner) throws IOException { synchronized(LOCK){Entry e=read();if(e!=null&&!Objects.equals(e.owner,owner))discard(e,true);} }
    public void clean(long now) throws IOException { synchronized(LOCK){
        Entry e=null;try{e=read();}catch(IOException invalid){return;}
        if(e!=null&&expired(e,now)&&!WRITERS.contains(e.id)){discard(e,true);e=null;}
        File[] files=root.listFiles();if(files==null)return;
        for(File f:files)if(f.getName().matches("[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}(?:-[^/\\\\\\p{Cntrl}]+)?\\.(png|json)")&&(e==null||!f.getName().startsWith(e.id))&&now-f.lastModified()>=TTL&&!Files.isSymbolicLink(f.toPath()))Files.deleteIfExists(child(f.getName()).toPath());
    }}
}

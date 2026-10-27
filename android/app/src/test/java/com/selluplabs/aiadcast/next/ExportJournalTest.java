package com.selluplabs.aiadcast.next;
import org.junit.Test;
import org.junit.Rule;
import org.junit.rules.TemporaryFolder;
import static org.junit.Assert.*;
import java.io.*;
import java.nio.file.*;
import java.util.*;

public class ExportJournalTest {
 @Rule public TemporaryFolder temp=new TemporaryFolder();
 final byte[] png={(byte)137,80,78,71,13,10,26,10,1,2};
 final long now=1000000;
 ExportJournal journal() throws Exception {return new ExportJournal(new File(temp.getRoot(),"exports"),new File(temp.getRoot(),"sequence"));}
 ExportJournal.Entry prepare(ExportJournal j) throws Exception {return j.prepare(UUID.randomUUID().toString(),"owner-a","광고.png","image/png",png,now);}
 @Test public void restartRecoversExactBytesAndOwnerWithoutOriginalProject() throws Exception {
  ExportJournal first=journal();ExportJournal.Entry e=prepare(first);first.picking(e.id,e.owner,now);
  ExportJournal restarted=journal();ExportJournal.Entry restored=restarted.recover(e.owner,now+1);
  assertEquals(e.id,restored.id);assertArrayEquals(png,restarted.verifiedBytes(restored));assertEquals("picking",restored.stage);
 }
 @Test public void pickerReturnAfterRestartClaimsOnceAndCompletionRemovesOnlyExport() throws Exception {
  File original=temp.newFile("original-project.json");ExportJournal j=journal();ExportJournal.Entry e=prepare(j);e=j.picking(e.id,e.owner,now);
  ExportJournal restarted=journal();ExportJournal.Entry claim=restarted.claim(e.code,e.owner,now);
  assertNotNull(claim);assertNull(restarted.claim(e.code,e.owner,now));restarted.finish(e.id,true);restarted.finish(e.id,true);
  assertNull(restarted.recover(e.owner,now));assertTrue(original.exists());
 }
 @Test public void failedOutputIncludingPermissionOrDiskFailureRetainsVerifiedFile() throws Exception {
  ExportJournal j=journal();ExportJournal.Entry e=prepare(j);e=j.picking(e.id,e.owner,now);assertNotNull(j.claim(e.code,e.owner,now));
  j.finish(e.id,false);ExportJournal.Entry restored=journal().recover(e.owner,now);assertEquals("ready",restored.stage);assertArrayEquals(png,j.verifiedBytes(restored));
  ExportJournal.Entry retry=j.picking(e.id,e.owner,now);assertNotEquals(e.code,retry.code);assertNull(j.claim(e.code,e.owner,now));assertNotNull(j.claim(retry.code,e.owner,now));j.finish(e.id,true);
 }
 @Test public void interruptionAfterWritingMarkerOffersExplicitNewPickerNotAutomaticRewrite() throws Exception {
  ExportJournal j=journal();ExportJournal.Entry e=prepare(j);e=j.picking(e.id,e.owner,now);
  File metadata=new File(temp.getRoot(),"exports/pending.properties");Properties p=new Properties();try(InputStream in=new FileInputStream(metadata)){p.load(in);}p.setProperty("stage","writing");try(OutputStream out=new FileOutputStream(metadata)){p.store(out,null);}
  ExportJournal restarted=journal();assertNull(restarted.claim(e.code,e.owner,now));ExportJournal.Entry next=restarted.picking(e.id,e.owner,now);assertNotEquals(e.code,next.code);
 }
 @Test public void duplicateClicksCannotReplacePendingPayload() throws Exception {
  ExportJournal j=journal();ExportJournal.Entry e=prepare(j);
  try{prepare(j);fail();}catch(IOException expected){}assertEquals(e.id,j.recover(e.owner,now).id);
 }
 @Test public void staleCallbackCannotClaimNewJob() throws Exception {
  ExportJournal j=journal();ExportJournal.Entry first=prepare(j);first=j.picking(first.id,first.owner,now);j.cancel(first.id,true);
  ExportJournal.Entry second=prepare(j);second=j.picking(second.id,second.owner,now);
  assertNull(j.claim(first.code,first.owner,now));assertNotNull(j.claim(second.code,second.owner,now));j.finish(second.id,true);
 }
 @Test public void accountSwitchOrLogoutDiscardsOnlyOwnExport() throws Exception {
  ExportJournal j=journal();File original=temp.newFile("keep.png");ExportJournal.Entry e=prepare(j);j.isolate("guest");assertNull(j.recover("owner-b",now));assertTrue(original.exists());assertFalse(new File(temp.getRoot(),"exports/"+e.id+".png").exists());
 }
 @Test public void accountSwitchDuringWriterInvalidatesFurtherWritesAndOldCompletion() throws Exception {
  ExportJournal j=journal();ExportJournal.Entry e=prepare(j);e=j.picking(e.id,e.owner,now);j.claim(e.code,e.owner,now);j.isolate("owner-b");assertFalse(j.active(e.id,e.owner));
  ExportJournal.Entry b=j.prepare(UUID.randomUUID().toString(),"owner-b","b.png","image/png",png,now);j.finish(e.id,true);assertEquals(b.id,j.recover("owner-b",now).id);
 }
 @Test public void missingAndChangedPayloadsFailClosed() throws Exception {
  ExportJournal j=journal();ExportJournal.Entry e=prepare(j);Files.delete(j.file(e).toPath());try{j.recover(e.owner,now);fail();}catch(IOException expected){}assertNull(j.recover(e.owner,now));
  e=prepare(j);Files.write(j.file(e).toPath(),new byte[png.length]);try{j.recover(e.owner,now);fail();}catch(IOException expected){}assertNull(j.recover(e.owner,now));
 }
 @Test public void expiryBoundaryAndSharedFileRetentionAreBounded() throws Exception {
  ExportJournal j=journal();ExportJournal.Entry e=prepare(j);assertNotNull(j.recover(e.owner,now+ExportJournal.TTL-1));assertNull(j.recover(e.owner,now+ExportJournal.TTL));
  e=prepare(j);File shared=j.file(e);j.cancel(e.id,false);assertTrue(shared.exists());shared.setLastModified(now);j.clean(now+ExportJournal.TTL);assertFalse(shared.exists());
  File legacy=new File(temp.getRoot(),"exports/"+UUID.randomUUID()+"-legacy.png");Files.write(legacy.toPath(),png);legacy.setLastModified(now);File untouched=new File(temp.getRoot(),"exports/original.png");Files.write(untouched.toPath(),png);untouched.setLastModified(now);j.clean(now+ExportJournal.TTL);assertFalse(legacy.exists());assertTrue(untouched.exists());
 }
 @Test public void traversalAndSymlinkCannotReadOrDeleteOutsideCache() throws Exception {
  ExportJournal j=journal();File outside=temp.newFile("keep-original.png");Files.write(outside.toPath(),png);
  try{j.prepare("../../keep-original","owner-a","x.png","image/png",png,now);fail();}catch(IOException expected){}
  ExportJournal.Entry e=prepare(j);File file=j.file(e);Files.delete(file.toPath());Files.createSymbolicLink(file.toPath(),outside.toPath());
  try{j.recover(e.owner,now);fail();}catch(IOException expected){}assertArrayEquals(png,Files.readAllBytes(outside.toPath()));
 }
 @Test public void metadataFailureLeavesNoNewPayloadAndNeverTouchesOriginal() throws Exception {
  ExportJournal j=journal();new File(temp.getRoot(),"exports/pending.tmp").mkdir();String id=UUID.randomUUID().toString();
  try{j.prepare(id,"owner-a","x.png","image/png",png,now);fail();}catch(IOException expected){}assertFalse(new File(temp.getRoot(),"exports/"+id+".png").exists());
 }
 @Test public void sameProcessSecondInstanceCannotReopenActiveWriter() throws Exception {
  ExportJournal j=journal();ExportJournal.Entry e=prepare(j);e=j.picking(e.id,e.owner,now);j.claim(e.code,e.owner,now);
  try{journal().picking(e.id,e.owner,now);fail();}catch(IOException expected){}j.finish(e.id,false);assertNotNull(journal().picking(e.id,e.owner,now));
 }
 @Test public void exhaustedOrCorruptSequenceNeverReusesOldRequestCode() throws Exception {
  ExportJournal j=journal();ExportJournal.Entry e=prepare(j);try(DataOutputStream out=new DataOutputStream(new FileOutputStream(new File(temp.getRoot(),"sequence")))){out.writeInt(65534);}
  try{j.picking(e.id,e.owner,now);fail();}catch(IOException expected){}assertEquals("ready",j.recover(e.owner,now).stage);
 }
 @Test public void outputFailureAndCancellationLeaveRecoverableBytes() throws Exception {
  ExportJournal j=journal();ExportJournal.Entry e=prepare(j);e=j.picking(e.id,e.owner,now);j.claim(e.code,e.owner,now);
  try{j.copyTo(e,new OutputStream(){public void write(int b)throws IOException{throw new IOException("No space or permission");}},()->true);fail();}catch(IOException expected){}j.finish(e.id,false);
  assertArrayEquals(png,j.verifiedBytes(j.recover(e.owner,now)));
  ByteArrayOutputStream dest=new ByteArrayOutputStream();try{j.copyTo(e,dest,()->false);fail();}catch(IOException expected){}assertEquals(0,dest.size());
  j.copyTo(e,dest,()->true);assertArrayEquals(png,dest.toByteArray());
 }
}

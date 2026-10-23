package local.travel;

import java.io.*;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import local.travel.Models.*;
import org.springframework.stereotype.Service;

@Service
public class DirectoryRelocationService {
    final RelocationService relocation;
    final Map<String,Plan> plans=new ConcurrentHashMap<>();
    record Candidate(String token,String path,boolean verified,String verification,String oldImage,String newImage) {}
    record Row(String photoId,String fileName,String oldPath,String state,String message,List<Candidate> candidates) {}
    record Preview(String token,String rootId,String oldPath,String newPath,int total,int matchedCount,int ambiguousCount,int unmatchedCount,int availableCount,List<Row> rows) {}
    record Choice(String photoId,String candidateToken,boolean confirmUnverified) {}
    record Result(int restored,int retained,String newRootId) {}
    record Plan(Preview preview,String rootSignature,List<String> childTokens,Instant expires) {}
    DirectoryRelocationService(RelocationService relocation){this.relocation=relocation;}

    Preview preview(String rootId,String value) throws IOException {
        try(var lease=relocation.maintenance.read()) {
            return relocation.idle(()->{
                cleanup();Root root=relocation.roots.selectById(rootId);
                if(root==null)throw new NoSuchElementException("原目录不存在");
                if(relocation.jdbc.queryForObject("SELECT count(*) FROM photos WHERE root_id=? AND normalized_path=?",Integer.class,rootId,root.normalizedPath)>0)
                    throw new IllegalArgumentException("这是单张照片来源，请从查看器重新定位该照片");
                Path folder=relocation.safePath(value);
                if(!Files.isDirectory(folder)||!Files.isReadable(folder))throw new IllegalArgumentException("请选择可读取的新目录");
                folder=folder.toRealPath();final Path destination=folder;
                List<Path> files=new ArrayList<>();Map<Path,Long> sizes=new HashMap<>();
                Files.walkFileTree(folder,new SimpleFileVisitor<>() {
                    @Override public FileVisitResult preVisitDirectory(Path dir,BasicFileAttributes attrs) throws IOException {
                        return ScanService.isLink(dir)?FileVisitResult.SKIP_SUBTREE:FileVisitResult.CONTINUE;
                    }
                    @Override public FileVisitResult visitFile(Path file,BasicFileAttributes attrs) throws IOException {
                        if(attrs.isRegularFile()&&!ScanService.isLink(file)&&file.getFileName().toString().toLowerCase(Locale.ROOT).matches(".*\\.(jpg|jpeg|png|webp)$")) {
                            files.add(file);sizes.put(file,attrs.size());
                        }
                        return FileVisitResult.CONTINUE;
                    }
                    @Override public FileVisitResult visitFileFailed(Path file,IOException failure) throws IOException {throw new IOException("所选目录无法完整读取，请检查权限后重试",failure);}
                });
                files.sort(Comparator.comparing(Path::toString));
                Map<String,Path> byPath=new HashMap<>();for(Path file:files)byPath.put(ScanService.normalized(file),file);
                List<Photo> photos=relocation.library.photosForRelocation(root.normalizedPath);
                if(photos.isEmpty())throw new IllegalArgumentException("此目录下没有照片索引，无需重新定位");
                List<Row> rows=new ArrayList<>();List<String> children=new ArrayList<>();
                try {
                    for(Photo photo:photos) {
                        try{relocation.requireUnavailable(photo);}catch(IllegalArgumentException available){rows.add(new Row(photo.id,photo.fileName,photo.path,"available","原路径仍可访问，将保留原关联",List.of()));continue;}
                        Path expected=destination.resolve(Path.of(root.normalizedPath).relativize(Path.of(photo.normalizedPath)));
                        Path exact=byPath.get(ScanService.normalized(expected));
                        List<Path> possibilities;
                        if(exact!=null)possibilities=List.of(exact);
                        else {
                            possibilities=files.stream().filter(file->Objects.equals(sizes.get(file),photo.size)&&file.getFileName().toString().equalsIgnoreCase(photo.fileName)).toList();
                            if(possibilities.isEmpty())possibilities=files.stream().filter(file->Objects.equals(sizes.get(file),photo.size)).toList();
                        }
                        List<Candidate> candidates=new ArrayList<>();String reason="没有通过核对的候选，原索引将保留";
                        for(Path candidate:possibilities) {
                            try {
                                var selected=relocation.prepare(photo.id,candidate.toString());var p=selected.preview();children.add(p.token());
                                candidates.add(new Candidate(p.token(),p.newPath(),p.verified(),p.verification(),p.oldImage(),p.newImage()));
                            }catch(IOException|IllegalArgumentException failure){reason=failure.getMessage();}
                        }
                        String state=candidates.isEmpty()?"unmatched":candidates.size()>1?"ambiguous":candidates.getFirst().verified?"matched":"manual";
                        String message=switch(state){case "matched"->"单一候选通过大小、尺寸和旧缩略图核对";case "manual"->"缺少旧缩略图，需要人工确认";case "ambiguous"->"多个候选，请明确选择正确文件";default->reason;};
                        rows.add(new Row(photo.id,photo.fileName,photo.path,state,message,List.copyOf(candidates)));
                    }
                    Map<String,Set<String>> owners=new HashMap<>();
                    for(Row row:rows)for(Candidate candidate:row.candidates)owners.computeIfAbsent(ScanService.normalized(Path.of(candidate.path)),key->new HashSet<>()).add(row.photoId);
                    rows=rows.stream().map(row->{
                        if(row.state.equals("matched")&&owners.get(ScanService.normalized(Path.of(row.candidates.getFirst().path))).size()>1)
                            return new Row(row.photoId,row.fileName,row.oldPath,"ambiguous","多个旧记录指向同一新文件，请选择，不能重复关联",row.candidates);
                        return row;
                    }).toList();
                    String token=UUID.randomUUID().toString();
                    int matched=(int)rows.stream().filter(row->row.state.equals("matched")).count();
                    int ambiguous=(int)rows.stream().filter(row->row.state.equals("ambiguous")||row.state.equals("manual")).count();
                    int available=(int)rows.stream().filter(row->row.state.equals("available")).count();
                    Preview result=new Preview(token,rootId,root.path,destination.toString(),rows.size(),matched,ambiguous,rows.size()-matched-ambiguous-available,available,rows);
                    plans.put(token,new Plan(result,signature(root),List.copyOf(children),Instant.now().plus(Duration.ofMinutes(30))));return result;
                }catch(Exception failure){for(String token:children)relocation.discard(token);throw failure;}
            });
        }
    }
    Result confirm(String token,List<Choice> choices) throws IOException {
        try(var lease=relocation.maintenance.read()) {
            return relocation.idle(()->{
                Plan plan=require(token);Root original=relocation.roots.selectById(plan.preview.rootId);
                if(original==null||!signature(original).equals(plan.rootSignature))throw new LibraryMaintenance.Busy("原目录配置已变化，请重新选择目录并预览");
                if(choices==null||choices.isEmpty())throw new IllegalArgumentException("请至少确认一张待恢复照片");
                List<RelocationService.Selection> selected=new ArrayList<>();Set<String> photoIds=new HashSet<>(),targets=new HashSet<>();
                for(Choice choice:choices) {
                    Row row=plan.preview.rows.stream().filter(value->value.photoId.equals(choice.photoId)).findFirst().orElseThrow(()->new IllegalArgumentException("照片不属于本次预览"));
                    Candidate candidate=row.candidates.stream().filter(value->value.token.equals(choice.candidateToken)).findFirst().orElseThrow(()->new IllegalArgumentException("请选择本次预览中的候选文件"));
                    if(!candidate.verified&&!choice.confirmUnverified)throw new IllegalArgumentException("缺少旧缩略图的照片需要明确人工确认");
                    var selection=relocation.requireSelection(candidate.token);
                    if(!photoIds.add(choice.photoId)||!targets.add(ScanService.normalized(selection.file())))throw new IllegalArgumentException("一个新文件不能关联到多个旧索引，请重新选择");
                    if(!selection.file().startsWith(Path.of(plan.preview.newPath)))throw new IllegalArgumentException("候选超出所选新目录");
                    relocation.validate(selection);selected.add(selection);
                }
                Path directory=relocation.safePath(plan.preview.newPath);
                if(!Files.isDirectory(directory)||!ScanService.normalized(directory.toRealPath()).equals(ScanService.normalized(Path.of(plan.preview.newPath))))throw new IOException("新目录已变化，请重新预览");
                for(var selection:selected)Files.copy(selection.work().resolve("candidate.png"),relocation.paths.image(selection.original().id,selection.version(),false),StandardCopyOption.REPLACE_EXISTING);
                Result result=relocation.transaction.execute(status->{
                    for(var selection:selected)relocation.validateIndex(selection);
                    Root owner;
                    try{owner=relocation.scans.addRoot(directory.toString());}catch(IOException e){throw new UncheckedIOException(e);}
                    owner.enabled=true;owner.status="ready";relocation.roots.updateById(owner);
                    for(var selection:selected)relocation.apply(selection,owner.id);
                    if(!owner.id.equals(original.id)&&selected.size()==plan.preview.total&&relocation.jdbc.queryForObject("SELECT count(*) FROM photos WHERE root_id=?",Integer.class,original.id)==0)relocation.roots.deleteById(original.id);
                    return new Result(selected.size(),plan.preview.total-selected.size(),owner.id);
                });
                try{discard(token);}catch(IOException ignored){}return result;
            });
        }
    }
    static String signature(Root root){return root.id+"\0"+root.normalizedPath+"\0"+root.enabled+"\0"+root.status;}
    Plan require(String token){Plan plan=plans.get(token);if(plan==null||Instant.now().isAfter(plan.expires))throw new NoSuchElementException("目录预览已过期，请重新选择");return plan;}
    void discard(String token) throws IOException {Plan plan=plans.remove(token);if(plan!=null)for(String child:plan.childTokens)relocation.discard(child);}
    void cleanup() throws IOException {for(Plan plan:plans.values())if(Instant.now().isAfter(plan.expires))discard(plan.preview.token);}
}

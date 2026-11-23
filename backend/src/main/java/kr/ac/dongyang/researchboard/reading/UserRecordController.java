package kr.ac.dongyang.researchboard.reading;
import java.util.*;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/documents/{id}")
public class UserRecordController {
    private final UserRecords records;
    public UserRecordController(UserRecords records){this.records=records;}
    @GetMapping("/reading") public UserRecords.Reading reading(@PathVariable long id){return records.reading(id);}
    @PatchMapping("/reading") public UserRecords.Reading patch(@PathVariable long id,@RequestBody Map<String,Object> body){return records.patch(id,body);}
    @GetMapping("/note") public UserRecords.Note note(@PathVariable long id){return records.note(id);}
    @PutMapping("/note") public UserRecords.Note save(@PathVariable long id,@RequestBody Map<String,Object> body){return records.save(id,body);}
    @GetMapping("/topics") public List<Long> topics(@PathVariable long id){return records.topics(id);}
    @PutMapping("/topics/{topicId}") public List<Long> link(@PathVariable long id,@PathVariable long topicId){records.topic(id,topicId,true);return records.topics(id);}
    @DeleteMapping("/topics/{topicId}") public List<Long> unlink(@PathVariable long id,@PathVariable long topicId){records.topic(id,topicId,false);return records.topics(id);}
}

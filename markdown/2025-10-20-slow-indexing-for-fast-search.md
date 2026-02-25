# Slow Indexing for Fast Search

It started with O3. The LLMs enabled with websearch api (as tool call) started becoming a super human web searchers. There are quite a few cases where the newer LLMs found some obscure lemma for some Mathematician.

A few recent cases -

October 31st 2025 mathematician Tim Gowers tweeted
> I crossed an interesting threshold yesterday, which I think many other mathematicians have been crossing recently as well. In the middle of trying to prove a result, I identified a statement that looked true and that would, if true, be useful to me
>
> Instead of trying to prove it, I asked GPT5 about it, and in about 20 seconds received a proof. The proof relied on a lemma that I had not heard of (the statement was a bit outside my main areas), so although I am confident I'd have got there in the end, .....
>
> ...... it looks as though we have entered the brief but enjoyable era where our research is greatly sped up by AI .....
> PS .... I checked that the lemma was not a hallucination.

A week before that there was another such case where GPT-5 found reference to the solution of an Erdos problem. The claim is that it was buried in a paper containing various results and theorems and the proof was somewhere in the middle of two theorems.

How are we getting such great results? There are two ways LLMs can be excellent at search,
1. They have been trained on everything and RL'd to generate references of the pages they have in their training data with minimal hallucinations.
2. They know how to use search engines very well. For a given illformed human query they can create different searches, fetch much more results than a human would and zero in on the right answer.

There is a category of  Slow Search products brewing where the search happens asynchronously over hundreds (or even thousands of websites) and taking from minutes to hours. Yutori Scouts and parallel.ai are two products that come to mind.  Whether through memorization or search orchestration, LLMs are delivering impressive results.

Two bottlenecks come to mind:

1. **Speed**: if you're willing to wait for GPT-5 in the highest thinking mode while it does your searches for you I guess its fine. But we have the technology to deliver subsecond searches through millions of documents and there are cases where one doesn't really want a 10 page deepresearch article but just an answer or a link.
2. **Training Cut offs**: I reckon we are 5-10 years away till we get the continuously learning machine that will lead us to the promise land of AGI. Even if you believe the claims that in-context learning combined with ever increasing contexts is sufficient to reach AGI, I suspect that AGI would find it very hard to satisfy your search needs (unless again you compromise on speed).  For search results that require looking through content absent in the training data, you potentially need to collect a lot of context to provide a good search experience.

## Slow Indexing

A common trick is - trade off ahead of time compute for runtime latency. At runtime (or query time) your LLM can only search through *stuff* you have indexed properly. Without a good set of search index you need to spend a lot of time and inference cost (tool call,  tool result, think, tool call, tool result, think).  Where do LLMs shine? coming up with different kind of search queries (ahead of time), assessing if the results are good - if not why can't we index again in a different manner? If you create rich enough search index or even continuously keep updating, enriching the search index - adding more context, more annotations; you can avoid doing expensive searches at runtime. Just spend more at indexing time and give better search tools to your LLMs.

An example : In a podcast I listen to (the Rest is History) there is a specific joke they make about a south american genetlemen. I recall its something to do with some civil war. I want to find the name it escapes me. I had to go through 3 episodes to zero in on it. (The answer is Dr Valverde). To answer this question I can either put transcripts of all possible podcasts in an LLM context window or I let claude go wild on iterative search its difficult to get this answer. Unless I annotate entities with things like : South American Surname, Joke between the hosts, call back to a previous episode and create an index that includes these annotations!

There is clearly a scope for much more complicated LLM aided search index creation. It'll cost a pretty penny at index creation but will enable a wider range of queries.

I'm making two bets on the future of search
1. We'll start seeing more and more inference time compute spend go into the index creation business
2. Domain specific search engines will become more popular. Potentially exposing APIs utilized by the LLMs to do online search. I think this happens because you require care, domain knowledge, compute/money to construct those slow indexes I mentioned.

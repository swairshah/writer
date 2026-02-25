# Traditional Software with a Language Model Twist

Building software with LLMs can mean two very different things:

1. Use LLMs to help you write code - using claude-code, cursor, codex, copilot, devin, amp etc. to help you write parts of your software.
2. Call an LLM as part of the execution of a program - using the pattern matching ability of an LLM to do some data transformation as part of your software.

As of Dec 2025 majority of the economic value in 'AI' industry can be attributed to the rise of the coding LLMs and Agents. It makes senese that LLMs are getting better at writing/generating code. Code is all text, there is plenty of it on the internet (at least github and stackoverflow), it has an objective way of being 'correct' (if it typechecks, compiles, runs, tests pass etc.) and huge number of economic activiy is driven by software. 

I want to focus on the second paradigm. Where language model inference happens as part of the execution of your software. Of course you can write this category of software with aide of an LLM so the two paradigms I described are not completely distinct. 

As this is a new category of software where instead of writing the logic in a traditional programming language you are calling an LLM which is "programmed" through a natural language prompt. Currently most software that uses this paradigm uses a mix of "old school" logic you write in a programming language but you interleave calls to an LLM to do a specific task. The design space of this kind of software is vast and the possibilities will co-evolve with the progress in strengths, reliability and reduction in inference cost of LLMs. 

## A Magic Function Call

One way the LLM inference is getting injected in traditional software today is by offloading a pattern matching task to an LLM. LLM comes with a huge amount of world knowledge and the ability to "program" them via an instruction helps one write an LLM function. 

An example LLM function for extracting merchant info from noisy transaction data:

```
class MerchantInfo(BaseModel):
    name: str
    category: Literal["restaurant", "retail", "gas_station", 
                      "grocery", "entertainment", "travel", "other"]

@llm
def extract_merchant(transaction_description: str) -> MerchantInfo:
    """Extract the merchant name and category from a transaction description"""
```

This pattern matching ability can come in handy different ways 

### replace a large if-else block

Say you're building a fintech app that categorizes transactions. The raw merchant descriptions look like this:

```
STARBUCKS #12832
STARBUCK'S COFFEE
STARBUKS STORE 331
SBUX STORE 4421
SQ *STARBUCKS RESERV
```

The traditional approach would be to have a lookup table with fuzzy matching and a litany of if-else rules to handle edge cases. Where as all of these can be mapped to `starbucks` using an off the shelf LLM call. 

### replace a old school ML model call

To classify reviews or user feedback into sentiment scores the classic approach required collecting labeled data, feature engineering (bag of words, TF-IDF, n-grams), training a model, and deploying an inference pipeline. This also can be replaced by a careful prompt with the aspects you care about. 

All the frontier LLMs are multilingual (well for quite a few languages) due to having been trained on the entire internet. This also allows us map inputs in various langauges to consolidated output in one language. Some models like Gemini series, Claude series and GPT series (from 4o onwards) can also take images as input (and some can take audio as input as well) this allows multilingual feature extraction or annotation a possibility. 

## LM programming Libraries

I recommend using a library for this kind of programming. The primary reason is so that your program is modular, testable and maintenable. Instead of writing a big prompt and manually parsing the result relying on the library allows you to write and test small functions. You get failure attribution at a function level than at a line-in-a-prompt level.

The two main ones that i prefer are DSPy and BAML. To get a flavor of what it looks like to use these libraries we continue with the example of the extracting merchant information from transactions. 

### DSPy

DSPy models LLM calls as `signatures` which are typed input/output specifications. DSPy constructs the prompt from your description in the docstring, the signature's field names and types. 

```
class MerchantInfo(pydantic.BaseModel):
    name: str
    category: Literal["restaurant", "retail", "gas_station", 
                      "grocery", "entertainment", "travel", "other"]

class ExtractMerchant(dspy.Signature):
    """Extract the merchant name and category from a transaction description"""
    transaction_description: str = dspy.InputField()
    merchant: MerchantInfo = dspy.OutputField()

extract = dspy.Predict(ExtractMerchant)
result = extract(transaction_description="SQ *STARBUCKS RESERV")
```

There are few other useful features like instead of doing `dspy.Predict` one can do `dspy.ChainOfThought` which adds a reasoning field before the output to encourage the LLM to generate a reasoning trace - this takes more time but tends to give a higher accuracy results. If you want a more complicated pipeline of signatures you subclass `dspy.Module` and compose multiple signatures.

DSPy is a python library. There are efforts to recreate similar libraries in Rust ([DSRs](https://github.com/krypticmouse/DSRs)), Typescript ([ax](https://github.com/ax-llm/ax)), Ruby ([dspy.rb](https://github.com/vicentereig/dspy.rb)). Apart from may be the ruby implementation all of them look enough different that they are probably going to become a separate library in their own rights rather than a reimplementatino of DSPy.

### BAML

In BAML you define the LLM function in a `.baml` file with its own DSL, then generate typed clients for your language. This is quite useful as you can reuse the specifications in for example typescript in your frontend code and in python in your backend code. It also provides nice IDE integration for testing individual LLM program. 

The previous example can be written in baml as

```
enum Category {
    Restaurant
    Retail
    GasStation
    Grocery
    Entertainment
    Travel
    Other
}

class MerchantInfo {
    name string
    category Category
}

function ExtractMerchant(transaction_description: string) -> MerchantInfo {
    client "openai/gpt-4o-mini"
    prompt #"
        Extract the merchant name and category from this transaction:
        {{ transaction_description }}

        {{ ctx.output_format }}
    "#
}
```

Once you compile and generate a python client with `baml generate` you can use it in your python code as

```
import asyncio
from baml_client import b
from baml_client.types import MerchantInfo

result = asyncio.run(b.ExtractMerchant("AMZN MKTP US*2X4Y67890 Seattle WA"))
```

## Prompt optimization

DSPy has a construct called "optimizer". Given a dataset of inputs and outputs for a given DSPy signature you can use an optimizer to get the best prompt and in-context examples (the examples you put along side the prompt to help LLM get the right output). I believe this feature has limited shelf life and with improvements in LLMs the only thing you would want to have in your prompt would be the actual task you want to do with that prompt. 

## Conclusion

In both these libraries you get the ability to use standard software engineering principles to design your code. For the kind of software I described where you want to offload bits and pieces of your logic to the pattern matching ability of these machines these libraries are quite handy. 

I believe for "agentic" applications like Claude code, Amp, manus etc this isn't the right approach. These applications are offloading a huge amount of responsibility to the LLM, unline your traditional CMS or ERP software which might want to call an LLM for a small task here and there. Thus you may not have a clear way of decomposing the program into small DSPy like singature or modules. These systems do not just call LLM for a single task but its a iterative tool call - tool result - text generation sequence of sometimes 10s of steps. Here it becomes quite difficult to come up with an abstraction like DSPy or BAML. 

I also haven't come across a good way to represent tool calls in a framework like the ones we discussed. May be a better abstraction exists but for now 

- For agentic applications which basically is a while loop of LLM call - tool call - tool result stay away from 'frameworks'.
- To utilize LLMs in traditional systems definitely utilize these frameworks.

&nbsp;